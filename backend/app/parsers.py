"""Parsers that turn real log formats into QaceFlow events.

Only login outcomes are extracted. Every other line is counted and skipped, so
the analyst can see how much of the file was ignored.
"""

import re
from datetime import datetime, timezone
from typing import Any

SSHD_FORMAT = "sshd-auth-log"
MAX_LOG_BYTES = 5_000_000
MAX_RAW_LENGTH = 500

_LINE = re.compile(
    r"^(?P<mon>[A-Z][a-z]{2})\s+(?P<day>\d{1,2})\s+(?P<time>\d{2}:\d{2}:\d{2})\s+"
    r"(?P<host>\S+)\s+sshd(?:\[\d+\])?:\s+(?P<msg>.*)$"
)
_FAILED = re.compile(
    r"^Failed (?P<method>\S+) for (?P<invalid>invalid user )?(?P<user>\S+) "
    r"from (?P<ip>\S+) port \d+"
)
_ACCEPTED = re.compile(
    r"^Accepted (?P<method>\S+) for (?P<user>\S+) from (?P<ip>\S+) port \d+"
)


def parse_sshd_auth_log(text: str, year: int) -> dict[str, Any]:
    """Parse OpenSSH lines from a Linux ``auth.log`` / ``secure`` file.

    Syslog timestamps carry no year or time zone, so the caller supplies the
    year and times are treated as UTC.
    """
    events: list[dict[str, Any]] = []
    lines = text.splitlines()

    for line in lines:
        match = _LINE.match(line.strip())
        if match is None:
            continue

        message = match.group("msg")
        failed = _FAILED.match(message)
        accepted = None if failed else _ACCEPTED.match(message)
        outcome = failed or accepted
        if outcome is None:
            continue

        try:
            moment = datetime.strptime(
                f"{year} {match.group('mon')} {match.group('day')} {match.group('time')}",
                "%Y %b %d %H:%M:%S",
            ).replace(tzinfo=timezone.utc)
        except ValueError:
            continue  # for example 29 Feb in a non-leap year

        events.append({
            "event_id": f"LOG-{len(events) + 1:05d}",
            "timestamp": moment.isoformat(),
            "event_type": "authentication.failure" if failed else "authentication.success",
            "host": match.group("host"),
            "user": outcome.group("user"),
            "src_ip": outcome.group("ip"),
            "details": {
                "method": outcome.group("method"),
                "invalid_user": bool(failed and failed.group("invalid")),
                "parser": SSHD_FORMAT,
                "raw": line.strip()[:MAX_RAW_LENGTH],
            },
        })

    return {
        "events": events,
        "lines": len(lines),
        "skipped_lines": len(lines) - len(events),
    }
