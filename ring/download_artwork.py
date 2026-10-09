"""Download TMDB poster and backdrop assets for a watchlist into a local collection.

The TMDB credential is read only from ``TMDB_READ_ACCESS_TOKEN`` (preferred) or
``TMDB_API_KEY``.  It is never written into the generated metadata or assets.
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path


API_ROOT = "https://api.themoviedb.org/3"
IMAGE_ROOT = "https://image.tmdb.org/t/p"


def request(url: str, token: str, *, query: dict[str, str] | None = None) -> bytes:
    query = dict(query or {})
    headers = {"Accept": "application/json"}
    if token.count(".") >= 2:
        headers["Authorization"] = f"Bearer {token}"
    else:
        query["api_key"] = token
    if query:
        url = f"{url}?{urllib.parse.urlencode(query)}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as response:
        return response.read()


def find_title(movie: dict[str, object], token: str) -> dict[str, object] | None:
    lookup = movie["tmdb_lookup"]
    assert isinstance(lookup, dict)
    kind = "tv" if lookup["media_type"] == "tv" else "movie"
    base_query = {"query": str(lookup["query"]), "year" if kind == "movie" else "first_air_date_year": str(lookup["year"])}
    results = json.loads(request(f"{API_ROOT}/search/{kind}", token, query=base_query))["results"]
    if not results:
        results = json.loads(request(f"{API_ROOT}/search/{kind}", token, query={"query": str(lookup["query"])}))["results"]
    return results[0] if results else None


def download(image_path: str, destination: Path, token: str) -> bool:
    try:
        destination.write_bytes(request(f"{IMAGE_ROOT}/{image_path}", token))
        return True
    except Exception as error:  # noqa: BLE001 - report the individual image and continue
        print(f"  failed {destination.name}: {error}", file=sys.stderr)
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    token = os.environ.get("TMDB_READ_ACCESS_TOKEN") or os.environ.get("TMDB_API_KEY")
    if not token:
        parser.error("Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY outside the repository.")

    data = json.loads(args.input.read_text(encoding="utf-8"))
    output_dir = args.output_dir.resolve()
    poster_dir = output_dir / "posters"
    banner_dir = output_dir / "banners"
    poster_dir.mkdir(parents=True, exist_ok=True)
    banner_dir.mkdir(parents=True, exist_ok=True)

    missing: list[str] = []
    for movie in data["movies"]:
        movie.setdefault("images", {})
        image_data = movie["images"]
        poster_destination = poster_dir / f"{movie['id']}.jpg"
        banner_destination = banner_dir / f"{movie['id']}.jpg"
        if poster_destination.exists() and banner_destination.exists():
            image_data["poster_url"] = f"/data/streak-collection/posters/{movie['id']}.jpg"
            image_data["banner_url"] = f"/data/streak-collection/banners/{movie['id']}.jpg"
            print(f"reused {movie['title']}")
            continue
        try:
            hit = find_title(movie, token)
        except Exception as error:  # noqa: BLE001
            print(f"lookup failed: {movie['title']}: {error}", file=sys.stderr)
            missing.append(movie["title"])
            continue
        if not hit:
            missing.append(movie["title"])
            continue

        movie["tmdb_lookup"]["tmdb_id"] = hit["id"]
        poster_path = hit.get("poster_path")
        backdrop_path = hit.get("backdrop_path")
        if poster_destination.exists() or (poster_path and download(f"w500{poster_path}", poster_destination, token)):
            image_data["poster_url"] = f"/data/streak-collection/posters/{movie['id']}.jpg"
        else:
            image_data["poster_url"] = None
        if banner_destination.exists() or (backdrop_path and download(f"w1280{backdrop_path}", banner_destination, token)):
            image_data["banner_url"] = f"/data/streak-collection/banners/{movie['id']}.jpg"
        else:
            image_data["banner_url"] = None
        print(f"downloaded {movie['title']}")
        time.sleep(0.12)

    data["image_notes"] = "Artwork was retrieved from TMDB into this local collection; review licensing before public deployment."
    (output_dir / "metadata.json").write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if missing:
        print(f"No match for: {', '.join(missing)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
