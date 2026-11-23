"""Run an isolated Edge for the Playwright light-hold scenarios."""

import argparse
import os
from pathlib import Path

import uvicorn
from app.adapters import SimulatedDevice
from app.config import Settings
from app.main import create_app


class LightSensorDevice(SimulatedDevice):
    def __init__(self, sensor_file: Path):
        self.sensor_file = sensor_file

    def read(self, config, clock, sequence):
        report = super().read(config, clock, sequence)
        adc = int(self.sensor_file.read_text(encoding="ascii"))
        if not 0 <= adc <= 4095:
            raise ValueError("Simulated light sensor value must be in the ADC range 0–4095")
        light = next(
            reading
            for sensor in report["sensors"]
            for reading in sensor["readings"]
            if reading["metricId"] == "lightRaw"
        )
        light["value"] = adc
        return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=18055)
    args = parser.parse_args()

    sensor_file = os.getenv("HANDSON_E2E_LIGHT_SENSOR_FILE")
    if not sensor_file or not os.getenv("HANDSON_DATA_DIR"):
        parser.error("Set HANDSON_E2E_LIGHT_SENSOR_FILE and an isolated HANDSON_DATA_DIR")

    settings = Settings.from_env()
    if settings.mode != "simulation":
        parser.error("Set HANDSON_MODE=simulation")

    app = create_app(settings=settings, device=LightSensorDevice(Path(sensor_file)))
    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
