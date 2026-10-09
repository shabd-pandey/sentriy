CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS catalog_titles (
  id text PRIMARY KEY,
  title_type text NOT NULL CHECK (title_type IN ('film', 'series')),
  title text NOT NULL CHECK (length(trim(title)) > 0),
  synopsis text NOT NULL DEFAULT '',
  release_year integer CHECK (release_year BETWEEN 1888 AND 2200),
  poster_key text,
  active boolean NOT NULL DEFAULT false,
  watch_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_titles_order_idx
  ON catalog_titles (watch_order, title);

-- One operator-managed destination is shared by every profile-card QR code.
CREATE TABLE IF NOT EXISTS site_settings (
  setting_key text PRIMARY KEY,
  setting_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS series_seasons (
  title_id text NOT NULL REFERENCES catalog_titles(id) ON DELETE CASCADE,
  season_number integer NOT NULL CHECK (season_number > 0),
  episode_count integer NOT NULL CHECK (episode_count > 0),
  PRIMARY KEY (title_id, season_number)
);

CREATE TABLE IF NOT EXISTS screenings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title_id text NOT NULL REFERENCES catalog_titles(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text NOT NULL CHECK (length(trim(location)) > 0),
  capacity integer NOT NULL CHECK (capacity > 0),
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  sales_open_at timestamptz,
  sales_close_at timestamptz,
  cancelled boolean NOT NULL DEFAULT false,
  season_number integer,
  episode_start integer,
  episode_end integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (
    (season_number IS NULL AND episode_start IS NULL AND episode_end IS NULL)
    OR
    (season_number > 0 AND episode_start > 0 AND episode_end >= episode_start)
  ),
  FOREIGN KEY (title_id, season_number)
    REFERENCES series_seasons (title_id, season_number)
);

CREATE INDEX IF NOT EXISTS screenings_schedule_idx
  ON screenings (starts_at, id);

CREATE TABLE IF NOT EXISTS watch_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  title_id text NOT NULL REFERENCES catalog_titles(id) ON DELETE CASCADE,
  season_number integer,
  episode_number integer,
  watched_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (season_number IS NULL AND episode_number IS NULL)
    OR
    (season_number > 0 AND episode_number > 0)
  ),
  FOREIGN KEY (title_id, season_number)
    REFERENCES series_seasons (title_id, season_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS watch_progress_unique_idx
    ON watch_progress (user_id, title_id, season_number, episode_number) NULLS NOT DISTINCT;

CREATE TABLE IF NOT EXISTS booking_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id uuid NOT NULL REFERENCES screenings(id),
  user_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id uuid NOT NULL REFERENCES screenings(id),
  user_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  amount_minor integer NOT NULL CHECK (amount_minor >= 0),
  status text NOT NULL CHECK (status IN ('payment_pending', 'confirmed', 'failed', 'refunded')),
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW customer_screenings AS
SELECT
  s.*,
  t.title,
  t.title_type,
  t.active AS title_active,
  COALESCE((
    SELECT sum(b.quantity)::integer
    FROM bookings b
    WHERE b.screening_id = s.id AND b.status = 'confirmed'
  ), 0) AS sold_count,
  COALESCE((
    SELECT sum(h.quantity)::integer
    FROM booking_holds h
    WHERE h.screening_id = s.id AND h.expires_at > now()
  ), 0) AS held_count
FROM screenings s
JOIN catalog_titles t ON t.id = s.title_id;

CREATE OR REPLACE FUNCTION validate_screening_title_type()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_type text;
DECLARE season_episodes integer;
BEGIN
  SELECT title_type INTO selected_type FROM catalog_titles WHERE id = NEW.title_id;
  IF selected_type = 'film' AND
     (NEW.season_number IS NOT NULL OR NEW.episode_start IS NOT NULL OR NEW.episode_end IS NOT NULL) THEN
    RAISE EXCEPTION 'Film screenings cannot have an episode range';
  END IF;
  IF selected_type = 'series' THEN
    IF NEW.season_number IS NULL OR NEW.episode_start IS NULL OR NEW.episode_end IS NULL THEN
      RAISE EXCEPTION 'Series screenings require one season and an episode range';
    END IF;
    SELECT episode_count INTO season_episodes
      FROM series_seasons
      WHERE title_id = NEW.title_id AND season_number = NEW.season_number;
    IF season_episodes IS NULL OR NEW.episode_end > season_episodes THEN
      RAISE EXCEPTION 'Screening episode range exceeds the configured season';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS screenings_validate_title_type ON screenings;
CREATE TRIGGER screenings_validate_title_type
  BEFORE INSERT OR UPDATE OF title_id, season_number, episode_start, episode_end
  ON screenings FOR EACH ROW EXECUTE FUNCTION validate_screening_title_type();

CREATE OR REPLACE FUNCTION validate_watch_progress()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_type text;
DECLARE season_episodes integer;
BEGIN
  SELECT title_type INTO selected_type FROM catalog_titles WHERE id = NEW.title_id;
  IF selected_type = 'film' AND
     (NEW.season_number IS NOT NULL OR NEW.episode_number IS NOT NULL) THEN
    RAISE EXCEPTION 'Film progress cannot have an episode number';
  END IF;
  IF selected_type = 'series' THEN
    IF NEW.season_number IS NULL OR NEW.episode_number IS NULL THEN
      RAISE EXCEPTION 'Series progress requires an episode number';
    END IF;
    SELECT episode_count INTO season_episodes FROM series_seasons
      WHERE title_id = NEW.title_id AND season_number = NEW.season_number;
    IF season_episodes IS NULL OR NEW.episode_number > season_episodes THEN
      RAISE EXCEPTION 'Episode exceeds the configured season';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS watch_progress_validate_title_type ON watch_progress;
CREATE TRIGGER watch_progress_validate_title_type
  BEFORE INSERT OR UPDATE OF title_id, season_number, episode_number
  ON watch_progress FOR EACH ROW EXECUTE FUNCTION validate_watch_progress();

CREATE OR REPLACE FUNCTION validate_season_episode_count()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM screenings
    WHERE title_id = NEW.title_id AND season_number = NEW.season_number AND episode_end > NEW.episode_count
  ) OR EXISTS (
    SELECT 1 FROM watch_progress
    WHERE title_id = NEW.title_id AND season_number = NEW.season_number AND episode_number > NEW.episode_count
  ) THEN
    RAISE EXCEPTION 'Episode count cannot be reduced below watched progress or scheduled screening ranges';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS series_seasons_validate_count ON series_seasons;
CREATE TRIGGER series_seasons_validate_count
  BEFORE UPDATE OF episode_count ON series_seasons
  FOR EACH ROW EXECUTE FUNCTION validate_season_episode_count();
