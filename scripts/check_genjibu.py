#!/usr/bin/env python3
import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
import xml.etree.ElementTree as ET

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
    "YOUTUBE": {
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCz3x9qQNFcbc37R3ND0B8kw",
        "heading": "OshiNow YOUTUBE",
    },
    "X": {
        "url": "https://syndication.twitter.com/srv/timeline-profile/screen-name/genjibu_sdr",
        "heading": "OshiNow X",
    },
}


def normalize_title(category, text):
    text = re.sub(r"\s+", " ", text).strip()
    if category == "NEWS":
        text = re.sub(r"^\d{4}\.\d{2}\.\d{2}\s+posted\s+", "", text).strip()
    return text[:180]


STRONG_PREDICTION_PATTERNS = [
    r"今から",
    r"このあと",
    r"この後",
    r"まもなく",
    r"急遽",
    r"突然",
    r"インスタライブ",
    r"インライ",
    r"instagram\s*live",
]

STREAM_PATTERNS = [
    r"生配信",
    r"ライブ配信",
    r"配信開始",
    r"youtube\s*live",
    r"instagram",
    r"インスタ",
]


def prediction_level(text):
    lowered = text.lower()
    if any(re.search(p, lowered, re.IGNORECASE) for p in STRONG_PREDICTION_PATTERNS):
        return "urgent"
    if any(re.search(p, lowered, re.IGNORECASE) for p in STREAM_PATTERNS):
        return "stream"
    return None


def apply_prediction(item, text):
    level = prediction_level(text)
    if level == "urgent":
        item["heading"] = "OshiNow 🔴 配信予兆"
        item["prediction"] = "urgent"
    elif level == "stream":
        item["heading"] = "OshiNow 配信情報"
        item["prediction"] = "stream"
    else:
        item["prediction"] = None
    return item


def fetch_youtube(category, config):
    r = requests.get(config["url"], headers={"User-Agent": UA}, timeout=20)
    r.raise_for_status()

    root = ET.fromstring(r.content)
    ns = {
        "atom": "http://www.w3.org/2005/Atom",
        "yt": "http://www.youtube.com/xml/schemas/2015",
        "media": "http://search.yahoo.com/mrss/",
    }

    items = []
    for entry in root.findall("atom:entry", ns):
        title_node = entry.find("atom:title", ns)
        link_node = entry.find("atom:link", ns)
        video_id_node = entry.find("yt:videoId", ns)

        if title_node is None or not (title_node.text or "").strip():
            continue

        title = normalize_title(category, title_node.text.strip())
        if not title:
            continue

        url = None
        if link_node is not None:
            url = link_node.attrib.get("href")
        if not url and video_id_node is not None and (video_id_node.text or "").strip():
            url = f"https://www.youtube.com/watch?v={video_id_node.text.strip()}"
        if not url:
            continue

        description = ""
        desc_node = entry.find("media:group/media:description", ns)
        if desc_node is not None and desc_node.text:
            description = desc_node.text.strip()

        combined = f"{title} {description}"

        item = {
            "url": url,
            "title": title,
            "category": category,
            "heading": config["heading"],
        }
        items.append(apply_prediction(item, combined))

    return items


def fetch_x_public(category, config):
    """
    Best-effort reader for X's public profile syndication page.
    This endpoint is not a guaranteed public API, so failures must never stop
    the rest of OshiNow monitoring.
    """
    try:
        r = requests.get(
            config["url"],
            headers={
                "User-Agent": "Mozilla/5.0 OshiNow/0.3",
                "Accept-Language": "ja,en;q=0.8",
            },
            timeout=20,
        )
        if r.status_code != 200:
            print(f"X watcher unavailable: HTTP {r.status_code}. Skipping this run.")
            return []

        soup = BeautifulSoup(r.text, "html.parser")
        items = []
        seen = set()

        # Public syndication pages usually expose links containing /status/<id>.
        for a in soup.find_all("a", href=True):
            href = a.get("href", "")
            m = re.search(r"(?:https?://(?:www\.)?(?:x|twitter)\.com)?/genjibu_sdr/status/(\d+)", href)
            if not m:
                continue

            status_id = m.group(1)
            url = f"https://x.com/genjibu_sdr/status/{status_id}"
            if url in seen:
                continue

            container = a
            for _ in range(5):
                if container.parent is None:
                    break
                container = container.parent
                text = " ".join(container.stripped_strings)
                if len(text) >= 20:
                    break
            raw = re.sub(r"\s+", " ", " ".join(container.stripped_strings)).strip()
            if not raw:
                raw = f"公式Xの新着ポスト {status_id}"

            # Remove common UI fragments where possible.
            raw = re.sub(r"^(原因は自分にある。\s*)?@genjibu_sdr\s*", "", raw, flags=re.IGNORECASE)
            title = normalize_title(category, raw)

            item = {
                "url": url,
                "title": title,
                "category": category,
                "heading": config["heading"],
            }
            items.append(apply_prediction(item, raw))
            seen.add(url)

        if not items:
            print("X watcher returned no readable posts. Skipping X for this run.")
        else:
            print(f"X watcher found {len(items)} public post(s).")

        return items[:30]

    except Exception as e:
        print(f"X watcher error: {type(e).__name__}: {e}. Skipping X for this run.")
        return []


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

        item = {
            "url": url,
            "title": title,
            "category": category,
            "heading": config["heading"],
        }
        items.append(apply_prediction(item, raw))
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
            "prediction": item.get("prediction"),
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
        if category == "YOUTUBE":
            items = fetch_youtube(category, config)
        elif category == "X":
            items = fetch_x_public(category, config)
        else:
            items = fetch_category(category, config)
        current_by_category[category] = items

        # X is best-effort. Do not create an empty baseline when X blocks access.
        if category == "X" and not items:
            continue

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
        print("No new NEWS / LIVE / MEDIA / YOUTUBE / X items.")
        save_state(state)
        return 0

    # Keep category order predictable and limit bursts.
    category_rank = {"X": 0, "LIVE": 1, "YOUTUBE": 2, "MEDIA": 3, "NEWS": 4}
    prediction_rank = {"urgent": 0, "stream": 1, None: 2}
    pending.sort(key=lambda x: (
        prediction_rank.get(x.get("prediction"), 9),
        category_rank.get(x["category"], 9),
        x["url"],
    ))

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
