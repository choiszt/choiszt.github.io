import json
import sys

try:
    from scholarly import scholarly

    author = scholarly.search_author_id("W9190BQAAAAJ")
    author = scholarly.fill(author, sections=["basics"])

    data = {
        "citations": author.get("citedby", 0),
        "h_index": author.get("hindex", 0),
    }

    with open("public/scholar-stats.json", "w") as f:
        json.dump(data, f)

    print(f"Updated: {data}")
except Exception as e:
    print(f"Failed to update: {e}", file=sys.stderr)
    sys.exit(1)
