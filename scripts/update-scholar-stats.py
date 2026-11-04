"""Read citation count and h-index from the public Google Scholar profile page.

Google Scholar answers most GitHub runner IPs with HTTP 403/429. A blocked run leaves the
stats as they are and exits cleanly; running this locally (`npm run update-stats`) works.
"""

import json
import re
import sys
import urllib.error
import urllib.request

PROFILE_URL = "https://scholar.google.com/citations?user=W9190BQAAAAJ&hl=en"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
)
OUTPUT = "public/scholar-stats.json"


def main() -> None:
    request = urllib.request.Request(
        PROFILE_URL,
        headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            page = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            print(f"::warning::Google Scholar blocked this runner (HTTP {e.code}); stats unchanged")
            return
        raise

    # Stats table cells, in order: citations (all, since year), h-index (all, since year), i10 (...)
    cells = re.findall(r'class="gsc_rsb_std">(\d+)<', page)
    if len(cells) < 4:
        sys.exit("Stats table not found on the profile page")
    data = {"citations": int(cells[0]), "h_index": int(cells[2])}

    with open(OUTPUT, "w") as f:
        json.dump(data, f)

    print(f"Updated: {data}")


if __name__ == "__main__":
    main()
