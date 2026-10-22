#!/usr/bin/env python3
import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urljoin, urlencode

import requests
from bs4 import BeautifulSoup
import xml.etree.ElementTree as ET

SITE_URL = "https://genjibu.jp/"
ONESIGNAL_APP_ID = "d40f1748-dbb5-472a-aaa1-5178eb3ed064"
APP_URL = "https://takepiro7.github.io/Oshino-pwa/"
STATE_PATH = Path("data/news_seen.json")
EVENTS_PATH = Path("data/events.json")
JST = timezone(timedelta(hours=9))
MAX_PUSH_PER_RUN = 6
UA = "OshiNow/0.4 (+https://takepiro7.github.io/Oshino-pwa/)"
DETAIL_CACHE = {}

SOURCES = {
    "NEWS": {
        "url": SITE_URL,
        "heading": "OshiNow NEWS",
        "profile": "genjibu",
        "notify": True,
    },
    "LIVE": {
        "url": "https://genjibu.jp/news/3/?range=future_event_end_time&sort=asc",
        "heading": "OshiNow LIVE",
        "profile": "genjibu",
        "notify": True,
    },
    "MEDIA": {
        "url": "https://genjibu.jp/news/7/?range=all_event_start_time",
        "heading": "OshiNow MEDIA",
        "profile": "genjibu",
        "notify": True,
    },
    "YOUTUBE": {
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UCz3x9qQNFcbc37R3ND0B8kw",
        "heading": "OshiNow YOUTUBE",
        "profile": "genjibu",
        "notify": True,
    },
    "X": {
        "url": "https://syndication.twitter.com/srv/timeline-profile/screen-name/genjibu_sdr",
        "heading": "OshiNow X",
        "profile": "genjibu",
        "notify": True,
    },
    "EBIDAN": {
        "url": "https://ebidan.jp/",
        "base_url": "https://ebidan.jp/",
        "heading": "OshiNow EBiDAN",
        "profile": "ebidan",
        "notify": True,
    },
}

EBIDAN_GROUPS = [
    {"key": "bullettrain", "name": "超特急", "aliases": ["超特急"]},
    {"key": "milk", "name": "M!LK", "aliases": ["M!LK"]},
    {"key": "superdragon", "name": "SUPER★DRAGON", "aliases": ["SUPER★DRAGON", "SUPER☆DRAGON", "SUPER DRAGON"]},
    {"key": "sakurashimeji", "name": "Sakurashimeji", "aliases": ["Sakurashimeji", "さくらしめじ"]},
    {"key": "onenonly", "name": "ONE N’ ONLY", "aliases": ["ONE N’ ONLY", "ONE N' ONLY", "ONE N ONLY"]},
    {"key": "genjibu", "name": "原因は自分にある。", "aliases": ["原因は自分にある。", "原因は自分にある", "GENJIBU"]},
    {"key": "buddiis", "name": "BUDDiiS", "aliases": ["BUDDiiS"]},
    {"key": "icex", "name": "ICEx", "aliases": ["ICEx"]},
    {"key": "lienel", "name": "Lienel", "aliases": ["Lienel"]},
    {"key": "iiondo", "name": "iiONDO", "aliases": ["iiONDO"]},
]


def detect_ebidan_group(text):
    matches = []
    lowered = text.lower()
    for group in EBIDAN_GROUPS:
        if any(alias.lower() in lowered for alias in group["aliases"]):
            matches.append(group)
    # Cross-EBiDAN announcements can mention multiple groups. Keep them general
    # so every EBiDAN follower sees them rather than assigning one group.
    unique = {g["key"]: g for g in matches}
    if len(unique) == 1:
        return next(iter(unique.values()))
    return None


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
    """
    Best-effort YouTube RSS reader.
    YouTube occasionally returns transient 404/5xx responses for channel feeds.
    A YouTube failure must not stop NEWS/LIVE/MEDIA monitoring.
    """
    try:
        r = requests.get(config["url"], headers={"User-Agent": UA}, timeout=20)
        if r.status_code != 200:
            print(f"YouTube watcher unavailable: HTTP {r.status_code}. Skipping this run.")
            return []

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
                "text": combined,
                "profile": config.get("profile", "genjibu"),
                "notify": config.get("notify", True),
            }
            items.append(apply_prediction(item, combined))

        return items

    except Exception as e:
        print(f"YouTube watcher error: {type(e).__name__}: {e}. Skipping YouTube for this run.")
        return []


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
                "text": raw,
                "profile": config.get("profile", "genjibu"),
                "notify": config.get("notify", True),
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



def fetch_detail_text(url):
    """Best-effort extraction of official article text, cached per URL."""
    if url in DETAIL_CACHE:
        return DETAIL_CACHE[url]
    try:
        r = requests.get(url, headers={"User-Agent": UA}, timeout=15)
        if r.status_code != 200:
            DETAIL_CACHE[url] = ""
            return ""
        soup = BeautifulSoup(r.text, "html.parser")
        root = soup.find("main") or soup.find("article") or soup.body or soup
        for tag in root.find_all(["script", "style", "nav", "footer", "noscript"]):
            tag.decompose()
        text = re.sub(r"\s+", " ", " ".join(root.stripped_strings)).strip()
        DETAIL_CACHE[url] = text[:20000]
        return DETAIL_CACHE[url]
    except Exception as e:
        print(f"Detail fetch skipped for {url}: {type(e).__name__}: {e}")
        DETAIL_CACHE[url] = ""
        return ""


def clean_event_title(item):
    title = item.get("title", "")
    if item.get("profile") == "ebidan":
        # EBiDAN list titles begin with the article publication date.
        title = re.sub(r"^20\d{2}[./-]\d{1,2}[./-]\d{1,2}\s*", "", title).strip()
        group_name = item.get("group_name")
        if group_name:
            doubled = f"{group_name} {group_name} "
            if title.lower().startswith(doubled.lower()):
                title = title[len(group_name) + 1:]
    return title[:120]


def extract_date_candidates(item):
    """Find likely event/deadline dates and score context, not just first date."""
    title = re.sub(r"\s+", " ", item.get("title", "")).strip()
    detail = re.sub(r"\s+", " ", item.get("detail_text", "")).strip()
    text = (title + " " + detail).strip()
    now = datetime.now(JST)
    today = now.date()

    date_re = re.compile(r"(?:(20\d{2})[./年-])?(\d{1,2})[./月-](\d{1,2})日?")
    candidates = []
    for idx, m in enumerate(date_re.finditer(text)):
        year = int(m.group(1)) if m.group(1) else now.year
        month = int(m.group(2))
        day = int(m.group(3))
        try:
            dt = datetime(year, month, day, tzinfo=JST)
        except ValueError:
            continue

        if not m.group(1) and dt.date() < today:
            # Do not turn ordinary past dates (e.g. July/August seen in October)
            # into fake next-year events. Only Jan-Mar are safely inferred as
            # next year when announced late in the year.
            if now.month >= 10 and month <= 3:
                try:
                    dt = dt.replace(year=year + 1)
                except ValueError:
                    pass

        context = text[max(0, m.start()-80):min(len(text), m.end()+100)]
        score = 0
        if dt.date() >= today:
            score += 3
        else:
            score -= 12

        if re.search(r"締切|受付終了|応募締切|申込締切|販売終了|予約終了|まで", context):
            score += 10
        if re.search(r"開催|公演|出演|放送|配信|発売|実施|開演|開場|集合|START|スタート", context, re.IGNORECASE):
            score += 6
        if re.search(r"より|から", context):
            score += 2
        if re.search(r"更新|掲載|発表|お知らせ", context) and m.start() < len(title) + 20:
            score -= 2

        leading_publish = (
            item.get("profile") == "ebidan"
            and idx == 0
            and m.start() <= 2
            and bool(m.group(1))
        )
        if leading_publish:
            score -= 15

        # GENJIBU LIVE/MEDIA list dates are actual schedule dates.
        if (
            item.get("profile") == "genjibu"
            and item.get("category") in ("LIVE", "MEDIA")
            and idx == 0
            and m.start() <= 2
        ):
            score += 20

        near = text[m.end():m.end()+35]
        extra_days = []
        for dm in re.finditer(r"(?:・|、|,|／|/)\s*(\d{1,2})日", near):
            try:
                extra_day = int(dm.group(1))
                datetime(dt.year, dt.month, extra_day)
                extra_days.append(extra_day)
            except ValueError:
                pass

        time_context = text[max(0, m.start()-40):min(len(text), m.end()+90)]
        tm = re.search(r"(\d{1,2})[:：](\d{2})", time_context)
        hour = minute = 0
        if tm:
            h, mi = int(tm.group(1)), int(tm.group(2))
            if 0 <= h <= 23 and 0 <= mi <= 59:
                hour, minute = h, mi
                dt = dt.replace(hour=hour, minute=minute)

        end_dt = dt
        if extra_days:
            try:
                end_dt = datetime(dt.year, dt.month, max(extra_days), hour, minute, tzinfo=JST)
            except ValueError:
                end_dt = dt

        display = f"{dt.month}/{dt.day}"
        if extra_days:
            display += "・" + "・".join(str(d) for d in extra_days)
        if tm:
            display += f" {hour:02d}:{minute:02d}"

        candidates.append({
            "dt": dt,
            "end_dt": end_dt,
            "score": score,
            "position": m.start(),
            "leading_publish": leading_publish,
            "has_time": bool(tm),
            "display": display,
        })

    return candidates


def choose_event_date(item):
    candidates = extract_date_candidates(item)
    if not candidates:
        return None

    # EBiDAN list titles begin with the publication date. The same publication
    # date is often repeated in the article body, so remove every occurrence
    # of that date when a real schedule/deadline date is available.
    if item.get("profile") == "ebidan":
        published = next((c["dt"].date() for c in candidates if c["leading_publish"]), None)
        if published:
            usable = [c for c in candidates if c["dt"].date() != published]
        else:
            usable = [c for c in candidates if not c["leading_publish"]]
        if not usable:
            return None
        candidates = usable

    candidates.sort(key=lambda x: (-x["score"], x["dt"], x["position"]))
    return candidates[0]

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

        url = urljoin(config.get("base_url", SITE_URL), href)
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
            "text": raw,
            "profile": config.get("profile", "genjibu"),
            "notify": config.get("notify", True),
        }
        detail_text = ""
        if item["profile"] == "ebidan" or category == "NEWS":
            detail_text = fetch_detail_text(url)
        if detail_text:
            item["detail_text"] = detail_text
        if item["profile"] == "ebidan":
            group = detect_ebidan_group(f"{raw} {detail_text}")
            if group:
                item["group_key"] = group["key"]
                item["group_name"] = group["name"]
        items.append(apply_prediction(item, raw))
        seen.add(url)

    return items


def infer_event_type(item):
    text = " ".join(filter(None, [
        item.get("text", ""),
        item.get("detail_text", ""),
        item.get("title", ""),
    ]))
    category = item.get("category")
    if re.search(r"締切|申込|申し込み|受付終了|応募締切|販売終了|予約終了", text):
        return "締切", "⏰", "important", "期限までに確認・申込"
    if item.get("prediction") in ("urgent", "stream"):
        return "配信予兆", "🔴", "urgent", "Instagram / YouTubeを確認"
    if category == "LIVE" or re.search(r"ライブ|LIVE|TOUR|ツアー|公演|ファンミ", text, re.IGNORECASE):
        return "ライブ", "🎤", "normal", "会場・開演時刻を確認"
    if category == "MEDIA" or re.search(r"出演|テレビ|TV|TBS|フジテレビ|日本テレビ|テレビ朝日|NHK|ラジオ|放送", text, re.IGNORECASE):
        return "出演", "📺", "normal", "放送・配信時間を確認"
    if re.search(r"キャンペーン|SCRATCH|くじ|プレゼント|抽選", text, re.IGNORECASE):
        return "キャンペーン", "🎁", "normal", "参加・応募条件を確認"
    if re.search(r"発売|リリース|販売開始", text):
        return "発売", "💿", "normal", "発売・購入情報を確認"
    if re.search(r"撮影会|特典会|トークイベント|TALK SHOW|イベント", text, re.IGNORECASE):
        return "イベント", "🎟️", "normal", "日時・参加方法を確認"
    if category == "YOUTUBE":
        return "配信", "▶️", "normal", "YouTubeを確認"
    return "予定", "📌", "normal", "詳細を確認"



def infer_range_end(item, dt):
    """Infer a same-month end date from forms such as 10月24日・25日."""
    text = " ".join(filter(None, [
        item.get("title", ""),
        item.get("text", ""),
        item.get("detail_text", ""),
    ]))
    patterns = [
        r"(\d{1,2})月(\d{1,2})日\s*(?:・|、|,|／|/)\s*(\d{1,2})日",
        r"(\d{1,2})/(\d{1,2})\s*(?:・|、|,|／|/)\s*(\d{1,2})",
    ]
    for pattern in patterns:
        for m in re.finditer(pattern, text):
            month, start_day, end_day = map(int, m.groups())
            if month == dt.month and start_day == dt.day and end_day >= start_day:
                try:
                    return dt.replace(day=end_day)
                except ValueError:
                    pass
    return dt

def extract_event(item):
    now = datetime.now(JST)

    # YouTube is useful for push signals, but it is too noisy for the calendar.
    if item.get("category") == "YOUTUBE":
        return None

    chosen = choose_event_date(item)
    if not chosen:
        return None

    dt = chosen["dt"]
    range_end = infer_range_end(item, chosen.get("end_dt", dt))
    chosen["end_dt"] = range_end
    if range_end.date() > dt.date() and "・" not in chosen["display"].split(" ")[0]:
        time_suffix = ""
        if chosen["has_time"]:
            time_suffix = " " + dt.strftime("%H:%M")
        chosen["display"] = f"{dt.month}/{dt.day}・{range_end.day}{time_suffix}"
    event_type, icon, urgency, action = infer_event_type(item)
    title = clean_event_title(item)
    if (
        item.get("category") in ("NEWS", "EBIDAN")
        and event_type == "予定"
        and dt.date() <= now.date()
    ):
        return None
    if (
        event_type == "予定"
        and re.search(r"メンテナンス|サービス再開|障害|会員証|発送完了|システム", title)
    ):
        return None
    event_id = re.sub(r"[^a-zA-Z0-9]+", "-", item.get("url", ""))[-80:] or f"event-{int(dt.timestamp())}"

    return {
        "id": event_id,
        "type": event_type,
        "icon": icon,
        "title": title,
        "date": dt.strftime("%Y-%m-%d"),
        "end_date": chosen.get("end_dt", dt).strftime("%Y-%m-%d"),
        "time": dt.strftime("%H:%M") if chosen["has_time"] else "終日",
        "urgency": urgency,
        "action": action,
        "who": (item.get("group_name") or "EBiDAN") if item.get("profile") == "ebidan" else "原因は自分にある。",
        "oshi": item.get("profile", "genjibu"),
        "group_key": item.get("group_key"),
        "group_name": item.get("group_name"),
        "what": title,
        "when": chosen["display"],
        "todo": action,
        "source": item.get("category", "公式"),
        "url": item.get("url", ""),
    }


def save_calendar_events(current_by_category):
    existing = []
    if EVENTS_PATH.exists():
        try:
            existing = json.loads(EVENTS_PATH.read_text(encoding="utf-8")).get("events", [])
        except Exception:
            existing = []

    today = datetime.now(JST).date()

    # Build fresh events from current official feeds.
    fresh = []
    for items in current_by_category.values():
        for item in items:
            event = extract_event(item)
            if not event:
                continue
            try:
                event_date = datetime.strptime(event["date"], "%Y-%m-%d").date()
                event_end_date = datetime.strptime(event.get("end_date", event["date"]), "%Y-%m-%d").date()
            except Exception:
                continue

            # Keep multi-day events through their final day, then remove them.
            if event_end_date < today:
                continue

            fresh.append(event)

    # Prefer the most specific official category when one URL appears in
    # multiple lists (for example MEDIA + NEWS).
    priority = {"LIVE": 0, "MEDIA": 1, "EBIDAN": 2, "NEWS": 3, "X": 4, "YOUTUBE": 5}
    by_url = {}
    for event in fresh:
        key = event.get("url") or event.get("id")
        current = by_url.get(key)
        if current is None or priority.get(event.get("source"), 9) < priority.get(current.get("source"), 9):
            by_url[key] = event

    fresh = list(by_url.values())
    fresh.sort(key=lambda e: (
        e.get("date", ""),
        e.get("time", ""),
        priority.get(e.get("source"), 9),
    ))

    deduped = []
    seen_keys = set()
    for event in fresh:
        title_key = re.sub(r"\W+", "", event.get("title", "")).lower()[:60]
        key = (event.get("date"), event.get("time"), title_key)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        deduped.append(event)

    EVENTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    EVENTS_PATH.write_text(
        json.dumps(
            {
                "updated_at": datetime.now(JST).isoformat(),
                "events": deduped[:200],
            },
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print(f"Calendar events: {len(deduped)} upcoming item(s)")


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


def summarize_for_push(item):
    text = re.sub(r"\s+", " ", clean_event_title(item)).strip()
    when = None
    action = None

    if item.get("category") not in ("YOUTUBE", "X"):
        chosen = choose_event_date(item)
        if chosen:
            when = chosen["display"]

    # Fallback extraction for sources without structured schedule context.
    m = None if when else re.search(r"(\d{1,2}/\d{1,2}(?:\([^)]*\))?(?:\s*\d{1,2}:\d{2})?)", text)
    if not when and not m:
        m = re.search(r"(\d{1,2}月\d{1,2}日(?:\([^)]*\))?(?:\s*\d{1,2}:\d{2})?)", text)
    if not when and not m:
        m = re.search(r"(\d{1,2}:\d{2})", text)
    if not when and m:
        when = m.group(1)

    pred = item.get("prediction")
    category = item.get("category")

    if pred == "urgent":
        what = "配信が始まる可能性"
        action = "Instagram / YouTubeを確認"
        if not when:
            when = "まもなく"
    elif pred == "stream":
        what = "配信情報"
        action = "配信先を確認"
    elif category == "LIVE":
        what = "ライブ・イベント情報"
        action = "会場・開演時刻を確認"
    elif category == "MEDIA":
        what = "出演情報"
        action = "放送・配信時間を確認"
    elif category == "YOUTUBE":
        what = "YouTube更新"
        action = "動画・配信を確認"
    elif category == "X":
        what = "公式Xの新着"
        action = "投稿内容を確認"
    else:
        what = "公式お知らせ"
        action = "詳細を確認"

    # Shorten raw title to avoid unreadable notifications.
    concise = text
    concise = re.sub(r"【[^】]{0,60}】", "", concise).strip()
    concise = re.sub(r"\[[^\]]{0,60}\]", "", concise).strip()
    if len(concise) > 90:
        concise = concise[:87] + "…"
    if not concise:
        concise = text or item.get("heading") or "OshiNow new update"

    lines = [
        f"何？ {what}",
    ]
    if when:
        lines.append(f"いつ？ {when}")
    lines.append(f"すること：{action}")
    return concise, "\n".join(lines)


def load_subscription_ids():
    raw_parts = [
        os.environ.get("ONESIGNAL_SUBSCRIPTION_ID", "").strip(),
        os.environ.get("ONESIGNAL_SUBSCRIPTION_IDS", "").strip(),
    ]
    raw = "\n".join(x for x in raw_parts if x)

    if not raw:
        return []

    uuid_pattern = re.compile(
        r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
    )
    ids = []
    for value in uuid_pattern.findall(raw):
        if value not in ids:
            ids.append(value)
    return ids



def make_app_deep_link(item):
    title = clean_event_title(item)
    chosen = None
    if item.get("category") not in ("YOUTUBE", "X"):
        chosen = choose_event_date(item)

    if item.get("prediction") == "urgent":
        what = "配信が始まる可能性"
        action = "Instagram / YouTubeを確認"
        when = chosen["display"] if chosen else "まもなく"
    elif item.get("prediction") == "stream":
        what = "配信情報"
        action = "配信先を確認"
        when = chosen["display"] if chosen else ""
    elif item.get("category") == "LIVE":
        what = "ライブ・イベント情報"
        action = "会場・開演時刻を確認"
        when = chosen["display"] if chosen else ""
    elif item.get("category") == "MEDIA":
        what = "出演情報"
        action = "放送・配信時間を確認"
        when = chosen["display"] if chosen else ""
    else:
        what = title or "公式お知らせ"
        action = "詳細を確認"
        when = chosen["display"] if chosen else ""

    source = item.get("group_name") or item.get("category") or "公式"
    params = {
        "notice": "push",
        "title": title or "OshiNow 通知",
        "what": what,
        "when": when,
        "action": action,
        "source": source,
        "link": item.get("url", ""),
    }
    return APP_URL + "?" + urlencode(params)

def post_onesignal(api_key, payload):
    return requests.post(
        "https://api.onesignal.com/notifications",
        headers={
            "Authorization": f"Key {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=20,
    )


def send_push(api_key, subscription_ids, item):
    concise, summary = summarize_for_push(item)
    profile = item.get("profile", "genjibu")

    push_heading = item["heading"]
    if profile == "ebidan" and item.get("group_name") and item.get("prediction") not in ("urgent", "stream"):
        push_heading = f"OshiNow · {item['group_name']}"

    base_payload = {
        "app_id": ONESIGNAL_APP_ID,
        "target_channel": "push",
        "headings": {
            "ja": push_heading,
            "en": "OshiNow",
        },
        "contents": {
            "ja": summary or "OshiNow 新着情報",
            "en": concise or "OshiNow new update",
        },
        "url": make_app_deep_link(item),
        "data": {
            "source": "oshinow_official",
            "profile": profile,
            "group_key": item.get("group_key"),
            "group_name": item.get("group_name"),
            "category": item["category"],
            "prediction": item.get("prediction"),
            "url": item["url"],
        },
    }

    # Primary route: users who selected this Oshi in the app.
    payload = dict(base_payload)
    filters = [
        {
            "field": "tag",
            "key": "oshi",
            "relation": "=",
            "value": profile,
        }
    ]
    if profile == "ebidan" and item.get("group_key"):
        filters.extend([
            {"operator": "AND"},
            {
                "field": "tag",
                "key": f"group_{item['group_key']}",
                "relation": "=",
                "value": "1",
            },
        ])

    is_urgent = item.get("prediction") == "urgent" or bool(
        re.search(r"締切|重要|緊急|受付終了|販売終了", item.get("title", ""))
    )
    if is_urgent:
        filters.extend([
            {"operator": "AND"},
            {"field": "tag", "key": "notify_urgent", "relation": "=", "value": "1"},
        ])
    if item.get("prediction") in ("urgent", "stream"):
        filters.extend([
            {"operator": "AND"},
            {"field": "tag", "key": "notify_prediction", "relation": "=", "value": "1"},
        ])

    payload["filters"] = filters

    r = post_onesignal(api_key, payload)
    if r.status_code >= 300:
        raise RuntimeError(f"OneSignal error {r.status_code}: {r.text[:500]}")

    data = r.json() if r.text else {}
    if data.get("id"):
        group_label = item.get("group_name") or "ALL"
        print(f"Sent [{profile}/{group_label}/{item['category']}]: {concise} -> {data['id']}")
        return True

    errors = data.get("errors") or []
    no_audience = any("not subscribed" in str(e).lower() for e in errors)


    if no_audience:
        print(f"No tagged push audience for {profile}; item recorded without push.")
        return True

    raise RuntimeError(f"OneSignal accepted request but returned no message id: {data}")


def main():
    api_key = os.environ.get("ONESIGNAL_REST_API_KEY", "").strip()
    subscription_ids = load_subscription_ids()
    if not api_key:
        print("ONESIGNAL_REST_API_KEY is not configured.", file=sys.stderr)
        return 2
    print(f"Legacy fallback IDs configured: {len(subscription_ids)} (not used for normal delivery).")

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

    save_calendar_events(current_by_category)

    if baselined:
        save_state(state)
        for category, count in baselined:
            print(f"Initialized {category} baseline with {count} existing item(s). No push sent for those.")
        # Continue so already-initialized categories can still detect new items.

    pending = []
    for category, items in current_by_category.items():
        seen = set(seen_by_category.get(category, []))
        for item in items:
            if item["url"] not in seen and item.get("notify", True):
                pending.append(item)

        if items and not any(x.get("notify", True) for x in items):
            seen_by_category[category] = [x["url"] for x in items][:500]

    if not pending:
        print("No new push items. Calendar data may still have updated.")
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
        if not send_push(api_key, subscription_ids, item):
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
