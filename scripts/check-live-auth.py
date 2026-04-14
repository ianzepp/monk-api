#!/usr/bin/env python3
import argparse
import json
import secrets
import sys
import urllib.error
import urllib.request
from typing import Any


def http_json(method: str, url: str, body: dict[str, Any] | None = None, headers: dict[str, str] | None = None) -> tuple[int, dict[str, Any]]:
    data = None
    merged_headers = {
        "accept": "application/json",
        "user-agent": "monk-live-auth-check/1.0 (+https://monk-api.com)",
    }
    if headers:
        merged_headers.update(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        merged_headers.setdefault("content-type", "application/json")

    request = urllib.request.Request(url, data=data, headers=merged_headers, method=method)
    try:
        with urllib.request.urlopen(request) as response:
            payload = response.read().decode("utf-8")
            return response.status, json.loads(payload)
    except urllib.error.HTTPError as error:
        payload = error.read().decode("utf-8")
        try:
            return error.code, json.loads(payload)
        except json.JSONDecodeError:
            return error.code, {"success": False, "raw": payload}


def fail(step: str, status: int, body: dict[str, Any], report: dict[str, Any]) -> None:
    report["ok"] = False
    report[step] = {"status": status, "body": body}
    print(json.dumps(report, indent=2))
    sys.exit(1)


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Monk live auth contract against a target base URL")
    parser.add_argument("--base-url", default="https://monk-api.com", help="API base URL")
    parser.add_argument("--tenant")
    parser.add_argument("--username", default="root_user")
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--skip-protected", action="store_true", help="Skip protected route probe after auth succeeds")
    args = parser.parse_args()

    suffix = secrets.token_hex(4)
    tenant = args.tenant or f"live_auth_{suffix}"
    username = args.username
    email = args.email or f"{username}_{suffix}@example.com"
    password = args.password or f"Pw_{suffix}_secret"
    base_url = args.base_url.rstrip("/")

    report: dict[str, Any] = {
        "ok": True,
        "base_url": base_url,
        "tenant": tenant,
        "username": username,
        "email": email,
    }

    register_status, register_body = http_json(
        "POST",
        f"{base_url}/auth/register",
        {
            "tenant": tenant,
            "username": username,
            "email": email,
            "password": password,
        },
    )
    report["register"] = {"status": register_status, "body": register_body}
    register_token = ((register_body.get("data") or {}).get("token") if isinstance(register_body, dict) else None)
    if register_status != 200 or not register_token:
        fail("register", register_status, register_body, report)

    login_status, login_body = http_json(
        "POST",
        f"{base_url}/auth/login",
        {
            "tenant": tenant,
            "username": username,
            "password": password,
        },
    )
    report["login"] = {"status": login_status, "body": login_body}
    login_token = ((login_body.get("data") or {}).get("token") if isinstance(login_body, dict) else None)
    if login_status != 200 or not login_token:
        fail("login", login_status, login_body, report)

    refresh_status, refresh_body = http_json(
        "POST",
        f"{base_url}/auth/refresh",
        headers={"Authorization": f"Bearer {login_token}"},
    )
    report["refresh"] = {"status": refresh_status, "body": refresh_body}
    refresh_token = ((refresh_body.get("data") or {}).get("token") if isinstance(refresh_body, dict) else None)
    if refresh_status != 200 or not refresh_token:
        fail("refresh", refresh_status, refresh_body, report)

    if not args.skip_protected:
        me_status, me_body = http_json(
            "GET",
            f"{base_url}/api/user/me",
            headers={"Authorization": f"Bearer {login_token}"},
        )
        report["me"] = {"status": me_status, "body": me_body}
        if me_status != 200:
            fail("me", me_status, me_body, report)

    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
