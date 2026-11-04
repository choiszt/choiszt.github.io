"""Read citation count and h-index from the public Google Scholar profile page.

One plain request per attempt: scholarly made many requests per run and Google Scholar
blocked it from GitHub runners ("Cannot Fetch from Google Scholar").
"""

import json
import re
import sys
import time
import urllib.error
import urllib.request

PROFILE_URL = "https://scholar.google.com/citations?user=W9190BQAAAAJ&hl=en"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
OUTPUT = "public/scholar-stats.json"
ATTEMPTS = 3


def fetch_stats() -> dict:
    request = urllib.request.Request(
        PROFILE_URL,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        page = response.read().decode("utf-8", "replace")

    # Stats table cells, in order: citations (all, since year), h-index (all, since year), i10 (...)
    cells = re.findall(r'class="gsc_rsb_std">(\d+)<', page)
    if len(cells) < 4:
        raise RuntimeError("stats table not found (likely a CAPTCHA page)")
    return {"citations": int(cells[0]), "h_index": int(cells[2])}


def main() -> None:
    for attempt in range(1, ATTEMPTS + 1):
        try:
            data = fetch_stats()
            break
        except (urllib.error.URLError, RuntimeError, TimeoutError) as e:
            print(f"Attempt {attempt}/{ATTEMPTS} failed: {e}", file=sys.stderr)
            if attempt == ATTEMPTS:
                sys.exit(1)
            time.sleep(60 * attempt)

    with open(OUTPUT, "w") as f:
        json.dump(data, f)

    print(f"Updated: {data}")


if __name__ == "__main__":
    main()
