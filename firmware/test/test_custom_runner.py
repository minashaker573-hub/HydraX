"""
HYDRAX — PlatformIO custom test runner.

`platformio.ini` declares `test_framework = custom` for the native environment
because the core test suite is a self-contained C++ program with its own
assertion harness rather than a Unity/GoogleTest suite. PlatformIO requires a
runner module for that framework; without this file `pio test -e native` fails
with "Could not find custom test runner".

This runner parses the harness's own output so PlatformIO reports one result
per test rather than a single pass/fail blob:

    [ ok ] dry soil starts irrigation
    [FAIL] cooldown blocks an immediate restart

Nothing about the C++ suite changes — it remains runnable with a plain
compiler and no PlatformIO at all (see docs/TESTING.md).
"""

import re

from platformio.public import TestCase, TestRunnerBase, TestStatus

# Matches the harness lines emitted by test/test_core/main.cpp.
RESULT_RE = re.compile(r"^\[(?P<status>\s*ok\s*|FAIL)\]\s+(?P<name>.+?)\s*$")

# The suite's closing summary, e.g. "50 tests, 1082 checks, 0 failed".
SUMMARY_RE = re.compile(
    r"^(?P<tests>\d+) tests, (?P<checks>\d+) checks, (?P<failed>\d+) failed\s*$"
)


class CustomTestRunner(TestRunnerBase):
    """Adapts the HYDRAX core suite's output to PlatformIO test results."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._failing_test = None
        self._failure_lines = []

    def on_testing_line_output(self, line):
        # Keep the raw output visible; it is more informative than the summary.
        super().on_testing_line_output(line)

        stripped = line.strip()
        if not stripped:
            return

        match = RESULT_RE.match(stripped)
        if match:
            self._flush_failure()
            name = match.group("name")
            passed = match.group("status").strip() == "ok"
            if passed:
                self.test_suite.add_case(TestCase(name=name, status=TestStatus.PASSED))
            else:
                # Detail lines for a failure are printed BEFORE its [FAIL] line,
                # so attach whatever was collected since the last result.
                message = "\n".join(self._failure_lines) or None
                self.test_suite.add_case(
                    TestCase(name=name, status=TestStatus.FAILED, message=message)
                )
                self._failure_lines = []
            return

        summary = SUMMARY_RE.match(stripped)
        if summary:
            self._flush_failure()
            return

        # Collect candidate failure detail ("FAIL file:line", "expected ...").
        if stripped.startswith("FAIL ") or stripped.startswith("expected "):
            self._failure_lines.append(stripped)

    def _flush_failure(self):
        self._failure_lines = []
