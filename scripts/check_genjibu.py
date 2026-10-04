#!/usr/bin/env python3
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

SITE_URL = "https://genjibu.jp/"
ONESIGNAL_APP_ID = "d40f1748-dbb5-472a-aaa1-5178eb3ed064"
STATE_PATH = Path("data/news_seen.json")
MAX_PUSH_PER_RUN = 6
UA = "OshiNow/0.2 (+https://takepiro7.github.io/Oshino-pwa/)"

SOURCES = {
    "NEWS": {
        "url": SITE_URL,
        "heading": "OshiNow NEWS",
    },
    "LIVE": {
        "url": "https://genjibu.jp/news/3/?range=future_event_end_time&sort=asc",
        "heading": "OshiNow LIVE",
    },
    "MEDIA": {
        "url": "https://genjibu.jp/news/7/?range=all_event_start_time",
        "heading": "OshiNow MEDIA",
    },
}


def normalize_title(category, text):
    text = re.sub(r"\s+", " ", text).strip()
    if category == "NEWS":
        text = re.sub(r"^\d{4}\.\d{2}\.\d{2}\s+posted\s+", "", text).strip()
    return text[:180]


def fetch_category(category, config):
    r = requests.get(config["url"], headers={"User-Agent": UA}, timeout=20)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")

    items = []
    seen = set()

    for a in soup.find_all("a", href=True):
        href = a["href"]
        if "/news/detail/" not in href:
            continue

        url = urljoin(SITE_URL, href)
        if url in seen:
            continue

        raw = " ".join(a.stripped_strings)
        if not raw:
            continue

        title = normalize_title(category, raw)
        if not title:
            continue

        items.append({
            "url": url,
            "title": title,
            "category": category,
            "heading": config["heading"],
        })
        seen.add(url)

    return items


def load_state():
    if not STATE_PATH.exists():
        return {"schema": 2, "seen_by_category": {}}

    state = json.loads(STATE_PATH.read_text(encoding="utf-8"))

    # Migrate the original NEWS-only format:
    # {"seen": ["https://genjibu.jp/news/detail/..."]}
    if "seen_by_category" not in state:
        return {
            "schema": 2,
            "seen_by_category": {
                "NEWS": state.get("seen", []),
            },
        }

    state.setdefault("schema", 2)
    state.setdefault("seen_by_category", {})
    return state


def save_state(state):
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATE_PATH.write_text(
        json.dumps(state, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def send_push(api_key, item):
    payload = {
        "app_id": ONESIGNAL_APP_ID,
        "target_channel": "push",
        "included_segments": ["Subscribed Users"],
        "headings": {
            "ja": item["heading"],
            "en": "OshiNow",
        },
        "contents": {
            "ja": item["title"],
            "en": item["title"],
        },
        "url": item["url"],
        "data": {
            "source": "genjibu_official",
            "category": item["category"],
            "url": item["url"],
        },
    }

    r = requests.post(
        "https://api.onesignal.com/notifications",
        headers={
            "Authorization": f"Key {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=20,
    )

    if r.status_code >= 300:
        raise RuntimeError(f"OneSignal error {r.status_code}: {r.text[:500]}")

    data = r.json() if r.text else {}
    if data.get("id"):
        print(f"Sent [{item['category']}]: {item['title']} -> {data['id']}")
        return True

    errors = data.get("errors") or []
    if any("not subscribed" in str(e).lower() for e in errors):
        print("No active OneSignal push subscribers. Leaving new items pending for retry.")
        return False

    raise RuntimeError(f"OneSignal accepted request but returned no message id: {data}")


def main():
    api_key = os.environ.get("ONESIGNAL_REST_API_KEY", "").strip()
    if not api_key:
        print("ONESIGNAL_REST_API_KEY is not configured.", file=sys.stderr)
        return 2

    state = load_state()
    seen_by_category = state["seen_by_category"]

    current_by_category = {}
    baselined = []

    for category, config in SOURCES.items():
        items = fetch_category(category, config)
        current_by_category[category] = items

        if category not in seen_by_category:
            # First time adding a source: establish a baseline and do not spam
            # existing announcements as "new".
            seen_by_category[category] = [x["url"] for x in items]
            baselined.append((category, len(items)))

    if baselined:
        save_state(state)
        for category, count in baselined:
            print(f"Initialized {category} baseline with {count} existing item(s). No push sent for those.")
        # Continue so already-initialized categories can still detect new items.

    pending = []
    for category, items in current_by_category.items():
        seen = set(seen_by_category.get(category, []))
        for item in items:
            if item["url"] not in seen:
                pending.append(item)

    if not pending:
        print("No new NEWS / LIVE / MEDIA items.")
        save_state(state)
        return 0

    # Keep category order predictable and limit bursts.
    category_rank = {"LIVE": 0, "MEDIA": 1, "NEWS": 2}
    pending.sort(key=lambda x: (category_rank.get(x["category"], 9), x["url"]))

    sent_count = 0
    for item in pending[:MAX_PUSH_PER_RUN]:
        if not send_push(api_key, item):
            print("Push audience is currently empty; workflow exits successfully and will retry later.")
            save_state(state)
            return 0

        seen_list = seen_by_category.setdefault(item["category"], [])
        if item["url"] not in seen_list:
            seen_list.insert(0, item["url"])
            del seen_list[500:]
        sent_count += 1

    save_state(state)
    print(f"Recorded and sent {sent_count} new item(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
