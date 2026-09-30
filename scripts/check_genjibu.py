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
APP_URL = "https://takepiro7.github.io/Oshino-pwa/"
ONESIGNAL_APP_ID = "d40f1748-dbb5-472a-aaa1-5178eb3ed064"
STATE_PATH = Path("data/news_seen.json")
MAX_PUSH_PER_RUN = 5

UA = "OshiNow/0.1 (+https://takepiro7.github.io/Oshino-pwa/)"


def fetch_news():
    r = requests.get(SITE_URL, headers={"User-Agent": UA}, timeout=20)
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
        text = " ".join(a.stripped_strings)
        if not text:
            continue
        # Homepage labels generally start with: 2026.09.25 posted ...
        title = re.sub(r"^\d{4}\.\d{2}\.\d{2}\s+posted\s+", "", text).strip()
        if not title:
            title = text
        items.append({"url": url, "title": title[:180]})
        seen.add(url)

    return items


def send_push(api_key, item):
    body = item["title"]
    payload = {
        "app_id": ONESIGNAL_APP_ID,
        "target_channel": "push",
        "included_segments": ["Subscribed Users"],
        "headings": {"ja": "OshiNow 新着", "en": "OshiNow"},
        "contents": {"ja": body, "en": body},
        "url": item["url"],
        "data": {"source": "genjibu_official", "url": item["url"]},
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
        print(f"Sent: {item['title']} -> {data['id']}")
        return True

    errors = data.get("errors") or []
    if any("not subscribed" in str(e).lower() for e in errors):
        print("No active OneSignal push subscribers. Leaving NEWS item pending for retry.")
        return False

    raise RuntimeError(f"OneSignal accepted request but returned no message id: {data}")


def main():
    api_key = os.environ.get("ONESIGNAL_REST_API_KEY", "").strip()
    if not api_key:
        print("ONESIGNAL_REST_API_KEY is not configured.", file=sys.stderr)
        return 2

    current = fetch_news()
    if not current:
        print("No public NEWS links found; state unchanged.", file=sys.stderr)
        return 1

    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)

    if STATE_PATH.exists():
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    else:
        state = {"seen": []}

    seen = set(state.get("seen", []))

    # First successful crawl establishes the baseline. Do not notify for
    # announcements that already existed before OshiNow monitoring started.
    if not seen:
        STATE_PATH.write_text(
            json.dumps({"seen": [x["url"] for x in current]}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Initialized baseline with {len(current)} existing NEWS items. No push sent.")
        return 0

    new_items = [x for x in current if x["url"] not in seen]

    if not new_items:
        print("No new NEWS items.")
        return 0

    # Send oldest first so multiple new notices arrive in natural order.
    to_send = list(reversed(new_items[:MAX_PUSH_PER_RUN]))
    all_sent = True
    for item in to_send:
        if not send_push(api_key, item):
            all_sent = False
            break

    if not all_sent:
        # Keep new items unseen so they are retried when a device subscribes again.
        print("Push audience is currently empty; workflow exits successfully and will retry later.")
        return 0

    all_seen = [x["url"] for x in current]
    # Keep older state too, in case an item drops off the homepage temporarily.
    for url in state.get("seen", []):
        if url not in all_seen:
            all_seen.append(url)

    STATE_PATH.write_text(
        json.dumps({"seen": all_seen[:500]}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Recorded {len(new_items)} new NEWS item(s).")


if __name__ == "__main__":
    raise SystemExit(main())
