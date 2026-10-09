"""Optionally enrich a copy of the watchlist with TMDB image references.

Use only after confirming that the applicable TMDB license permits this use.
The input is never overwritten unless --in-place and --overwrite are both set.
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

KEY = os.environ.get("TMDB_API_KEY")

IMG = "https://image.tmdb.org/t/p/"
POSTER_SIZE, BANNER_SIZE = "w500", "w1280"


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path, help="Source watchlist JSON")
    parser.add_argument("--output", required=True, type=Path, help="Separate destination JSON")
    parser.add_argument("--confirm-tmdb-license", action="store_true", help="Confirm you checked applicable TMDB licensing")
    parser.add_argument("--overwrite", action="store_true", help="Allow replacing an existing output file")
    parser.add_argument("--in-place", action="store_true", help="Allow --input and --output to be the same file")
    args = parser.parse_args()
    if not args.confirm_tmdb_license:
        parser.error("TMDB licensing must be confirmed before making API requests; pass --confirm-tmdb-license only after confirmation.")
    if not KEY:
        parser.error("Set TMDB_API_KEY in the environment.")
    same_file = args.input.resolve() == args.output.resolve()
    if same_file and not (args.in_place and args.overwrite):
        parser.error("Input and output are the same file; pass both --in-place and --overwrite to replace it.")
    if args.output.exists() and not args.overwrite:
        parser.error("Output already exists; choose another path or pass --overwrite.")
    return args

def get(path, **params):
    params["api_key"] = KEY
    url = f"https://api.themoviedb.org/3/{path}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=20) as r:
        return json.load(r)

def find(q):
    if q["media_type"] == "tv":
        res = get("search/tv", query=q["query"], first_air_date_year=q["year"]).get("results", [])
        if not res:
            res = get("search/tv", query=q["query"]).get("results", [])
    else:
        res = get("search/movie", query=q["query"], year=q["year"]).get("results", [])
        if not res:
            res = get("search/movie", query=q["query"]).get("results", [])
    return res[0] if res else None

args = parse_args()
with args.input.open(encoding="utf-8") as source:
    data = json.load(source)
missing = []
for m in data["movies"]:
    hit = find(m["tmdb_lookup"])
    if not hit:
        missing.append(m["title"]); continue
    if hit.get("poster_path"):
        m["images"]["poster_url"] = IMG + POSTER_SIZE + hit["poster_path"]
    if hit.get("backdrop_path"):
        m["images"]["banner_url"] = IMG + BANNER_SIZE + hit["backdrop_path"]
    m["tmdb_lookup"]["tmdb_id"] = hit["id"]
    print("ok ", m["title"])
    time.sleep(0.1)

data["image_notes"] = "TMDB references generated after licensing confirmation. Review all matches before use."
with args.output.open("w", encoding="utf-8") as destination:
    json.dump(data, destination, indent=2, ensure_ascii=False)
    destination.write("\n")
if missing:
    print("\nNo match for:", ", ".join(missing))
