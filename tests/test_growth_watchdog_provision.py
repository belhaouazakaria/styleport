"""No-network, unprivileged tests for root-only watchdog credential provisioner."""
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase, main
from unittest.mock import patch
import json

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "workers" / "provision-growth-lease-watchdog-alert-env.py"
spec = spec_from_file_location("watchdog_provisioner", TARGET)
provisioner = module_from_spec(spec)
spec.loader.exec_module(provisioner)

VALID = {
    "BREVO_API_KEY": "test-brevo-key-no-network",
    "EMAIL_FROM": "SayTwist Alerts <alerts@example.com>",
    "ALERT_ADMIN_EMAIL": "owner@example.com",
}


class ProvisionerSafetyTests(TestCase):
    def test_ascii_private_environment_contract(self):
        text = provisioner.serialize_env(VALID).decode("ascii")
        self.assertEqual(len(text.splitlines()), 3)
        self.assertEqual(set(line.split("=", 1)[0] for line in text.splitlines()), set(VALID))
        for line in text.splitlines():
            key, val = line.split("=", 1)
            self.assertEqual(json.loads(val), VALID[key])
        self.assertNotIn("DATABASE_URL", text)

    def test_deny_injection_invalid_sender_missing_keys_and_extras(self):
        bad = [
            {**VALID, "BREVO_API_KEY": "abc\nxyz123"},
            {**VALID, "ALERT_ADMIN_EMAIL": "bad value"},
            {**VALID, "EMAIL_FROM": "bad sender"},
            {**VALID, "EMAIL_FROM": "a@example.com\nEVIL=1"},
            {**VALID, "EMAIL_FROM": "Älice <a@example.com>"},
            {**VALID, "ALERT_ADMIN_EMAIL": "bad@a.com", "PRIVATE": "value"},
            {k: v for k, v in VALID.items() if k != "BREVO_API_KEY"},
            {**VALID, "BREVO_API_KEY": 42},
        ]
        for values in bad:
            with self.subTest(values=list(values)):
                with self.assertRaises(RuntimeError):
                    provisioner.serialize_env(values)

    def test_runtime_requires_root_even_with_approval(self):
        with patch.object(provisioner.os, "geteuid", return_value=1001):
            with self.assertRaises(RuntimeError):
                provisioner.preflight_root()

    def test_user_owned_node_runs_only_under_runuser_and_returns_three_values(self):
        mock_result = SimpleNamespace(returncode=0, stdout=json.dumps(VALID).encode())
        with patch.object(provisioner.subprocess, "run", return_value=mock_result) as runner:
            self.assertEqual(provisioner.read_unprivileged_pm2(), VALID)
        cmd = runner.call_args.args[0]
        self.assertEqual(cmd[:4], ["/usr/sbin/runuser", "-u", "saytwist", "--"])
        self.assertEqual(cmd[4], "/home/saytwist/.nvm/versions/node/v24.20.0/bin/node")
        self.assertEqual(runner.call_args.kwargs["env"]["HOME"], "/home/saytwist")
        self.assertNotIn("BREVO_API_KEY", runner.call_args.kwargs["env"])
        self.assertTrue(runner.call_args.kwargs["capture_output"])

    def test_deny_bad_pm2_output_without_exposure(self):
        for response in [
            SimpleNamespace(returncode=1, stdout=b"error"),
            SimpleNamespace(returncode=0, stdout=b"password-secret"),
            SimpleNamespace(returncode=0, stdout=b"x" * 8193),
            SimpleNamespace(returncode=0, stdout=json.dumps({**VALID, "EXTRA": "secret"}).encode()),
        ]:
            with patch.object(provisioner.subprocess, "run", return_value=response):
                with self.assertRaises(RuntimeError):
                    provisioner.read_unprivileged_pm2()

    def test_permissions_and_root_only_requirements_are_documented(self):
        source = TARGET.read_text()
        for required in (
            "sys.flags.isolated",
            "stat.S_IMODE(stat_info.st_mode) != 0o700",
            "check_root_owned_binary(sys.executable)",
            "HOSTINGER_WATCHDOG_ALERT_PROVISION_APPROVAL",
            "HOSTINGER_WATCHDOG_EXPECTED_SHA",
            "os.O_EXCL",
            "os.O_NOFOLLOW",
            "os.link(temporary, DEST",
            "os.fchmod(fd, 0o600)",
        ):
            self.assertIn(required, source)
        self.assertNotIn("shell=True", source)


if __name__ == "__main__":
    main()
