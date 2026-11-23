"""Run the full Playwright demo against an isolated Edge simulation."""

import argparse
import json
import os
import sys
from copy import deepcopy
from importlib import import_module
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-dir", type=Path, required=True)
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--web-origin", required=True)
    parser.add_argument("--state-dir", type=Path, required=True)
    parser.add_argument("--light-file", type=Path, required=True)
    args = parser.parse_args()

    if not (args.backend_dir / "app" / "main.py").is_file():
        parser.error("--backend-dir must point to a HandsOn-Backend checkout")
    if not 0 <= args.port <= 65535:
        parser.error("--port must be 0 or a valid TCP port")
    if not args.state_dir.is_absolute() or (args.state_dir / "handson.db").exists():
        parser.error("--state-dir must be an absolute path without an existing Edge database")
    if not args.light_file.is_absolute() or not args.light_file.is_file():
        parser.error("--light-file must point to an existing absolute path")
    origin = urlsplit(args.web_origin)
    if (
        origin.scheme != "http"
        or origin.hostname not in {"localhost", "127.0.0.1", "::1"}
        or origin.username is not None
        or origin.path
        or origin.query
        or origin.fragment
    ):
        parser.error("--web-origin must be the loopback Expo HTTP origin")

    operator_token = os.getenv("HANDSON_E2E_OPERATOR_TOKEN")
    expert_token = os.getenv("HANDSON_E2E_EXPERT_TOKEN")
    if not operator_token or not expert_token or operator_token == expert_token:
        parser.error("Set different operator and expert E2E tokens")

    fixtures_dir = Path(__file__).resolve().parents[1] / "fixtures"
    sys.dont_write_bytecode = True
    sys.path[:0] = [str(args.backend_dir.resolve()), str(fixtures_dir)]

    import uvicorn

    from app import main as edge_main, service as edge_service
    from app.config import Settings

    light_sensor_device = import_module("light-hold-edge").LightSensorDevice
    fixture = json.loads((fixtures_dir / "edge-approval.json").read_text(encoding="utf-8"))

    class FixedDraftDatabase(edge_service.Database):
        def put(self, db, kind, identifier, data):
            # The Edge simulation generator has no adapter hook. Substitute its draft
            # content before the real write and idempotent response, as in the approval test.
            if (
                kind == "draft"
                and data["revision"] == 0
                and data["generator"] == "simulation-template-v1"
                and data["title"] == fixture["title"]
                and data["confirmedText"] == fixture["transcript"]
            ):
                data.update(steps=deepcopy(fixture["steps"]), generator=fixture["generator"])
            super().put(db, kind, identifier, data)

    class DemoIntents(edge_service.SimulatedIntents):
        def interpret(self, text, session=None):
            if text != "현재 단계 완료했어":
                return super().interpret(text, session=session)
            return {**super().interpret("완료했어", session=session), "text": text}

    settings = Settings(
        mode="simulation",
        data_dir=args.state_dir,
        cors_origins=(args.web_origin,),
        operator_token=operator_token,
        expert_token=expert_token,
        heartbeat_timeout=0,
    )
    with (
        patch.object(edge_service, "Database", FixedDraftDatabase),
        patch.object(edge_service, "SimulatedIntents", DemoIntents),
    ):
        app = edge_main.create_app(settings, device=light_sensor_device(args.light_file))
        uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
