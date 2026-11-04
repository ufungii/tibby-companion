"""Synthetic fixtures only. No connection to an electronic health record."""

from models import Encounter, Source

ENCOUNTERS = (
    Encounter(id="demo-encounter-01", patientName="Demo patient 01",
              patientId="DEMO-001", dateOfBirth="2000-01-01", room="Simulation 01"),
    Encounter(id="demo-encounter-02", patientName="Demo patient 02",
              patientId="DEMO-002", dateOfBirth="2000-02-02", room="Simulation 02"),
)

VALUES = {"demo-encounter-01": "4.2", "demo-encounter-02": "4.0"}


def format_answer(encounter_id: str, intent: str) -> tuple[str, list[Source]]:
    if intent != "latest_potassium":
        return (
            "This prototype supports one record query: What is the latest potassium?",
            [],
        )
    value = VALUES[encounter_id]
    return (
        f"Simulated result: potassium {value} millimoles per liter, at 06:10.",
        [Source(
            title="Synthetic laboratory record",
            detail=(f"Potassium · {value} mmol/L · 06:10 (simulation)\n"
                    f"Encounter: {encounter_id}\n"
                    "Development fixture; no clinical record was queried."),
        )],
    )
