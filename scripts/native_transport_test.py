"""Real subprocess checks for the bounded trusted-native collection boundary."""
import os
import pathlib
import subprocess
import sys
import threading
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "clients" / "python"))
import wisp_client as CLIENT

STDOUT_LIMIT = 4194304
STDERR_LIMIT = 65536
SECRET = "private-native-output"


class NativeTransport(unittest.TestCase):
    def setUp(self):
        self.processes = []
        self.workers = []
        popen = subprocess.Popen
        thread = threading.Thread
        self.thread_type = thread

        def spawn(*args, **kwargs):
            process = popen(*args, **kwargs)
            self.processes.append(process)
            return process

        def worker(*args, **kwargs):
            result = thread(*args, **kwargs)
            self.workers.append(result)
            return result

        self.popen_patch = mock.patch.object(CLIENT.subprocess, "Popen", side_effect=spawn)
        self.thread_patch = mock.patch.object(CLIENT.threading, "Thread", side_effect=worker)
        self.popen_patch.start()
        self.thread_patch.start()
        self.addCleanup(self.popen_patch.stop)
        self.addCleanup(self.thread_patch.stop)

    def tearDown(self):
        for process in self.processes:
            self.assertIsNotNone(process.returncode, "direct child was not reaped")
            for stream in (process.stdin, process.stdout, process.stderr):
                if stream is not None:
                    self.assertTrue(stream.closed)
            if os.name == "posix":
                with self.assertRaises(ChildProcessError):
                    os.waitpid(process.pid, os.WNOHANG)
        self.assertTrue(all(not worker.is_alive() for worker in self.workers))

    def run_native(self, source, **kwargs):
        return CLIENT.run_cli(sys.executable, ["-c", "import sys,os,time\n" + source], **kwargs)

    def rejected(self, source, **kwargs):
        with self.assertRaises(CLIENT.ClientError) as caught:
            self.run_native(source, **kwargs)
        self.assertNotIn(SECRET, str(caught.exception))
        self.assertTrue(caught.exception.__suppress_context__ or caught.exception.__context__ is None)
        return str(caught.exception)

    def test_exact_default_stdout_cap(self):
        text = self.run_native("sys.stdout.buffer.write(b'x' * 4194304)")
        self.assertEqual(len(text.encode("utf-8")), STDOUT_LIMIT)

    def test_stdout_one_byte_over_cap_stops_before_deadline(self):
        message = self.rejected("sys.stdout.buffer.write(b'x' * 4194305); sys.stdout.flush(); time.sleep(60)", timeout=1)
        self.assertIn("collection limit", message)

    def test_exact_default_stderr_cap(self):
        self.assertEqual(self.run_native("sys.stderr.buffer.write(b'x' * 65536); print('ok')"), "ok\n")

    def test_stderr_one_byte_over_cap_invalidates_successful_stdout(self):
        message = self.rejected("print('successful'); sys.stdout.flush(); sys.stderr.buffer.write(b'x' * 65537); sys.stderr.flush(); time.sleep(60)", timeout=1)
        self.assertIn("collection limit", message)

    def test_utf8_wire_bytes_exact_and_one_over(self):
        text = self.run_native("sys.stdout.buffer.write(('é' * 2097152).encode('utf-8'))")
        self.assertEqual(len(text), STDOUT_LIMIT // 2)
        self.assertIn("collection limit", self.rejected("sys.stdout.buffer.write(('é' * 2097152).encode('utf-8') + b'x')"))

    def test_partial_utf8_at_cap_and_invalid_utf8_are_generic(self):
        for pipe in ("stdout", "stderr"):
            with self.subTest(pipe=pipe):
                self.rejected("sys.%s.buffer.write(%r + b'\\xff')" % (pipe, SECRET.encode()))
        self.rejected("sys.stdout.buffer.write(b'x' * 4194303 + b'\\xc3')")
        self.assertIn("collection limit", self.rejected("sys.stdout.buffer.write(b'x' * 4194303 + b'\\xc3\\xa9')"))

    def test_unicode_and_raw_newlines_preserved(self):
        text = "é\u2028\u0085\r\n"
        self.assertEqual(self.run_native("sys.stdout.buffer.write(%r)" % text.encode()), text)

    def test_concurrent_pipes_before_large_stdin(self):
        source = ("sys.stderr.buffer.write(b'e' * 65536); sys.stderr.flush(); "
                  "sys.stdout.buffer.write(b'o' * 262144); sys.stdout.flush(); "
                  "data = sys.stdin.buffer.read(); print(len(data))")
        text = self.run_native(source, input_text="é" * 262144, timeout=2)
        self.assertEqual(text, "o" * 262144 + "524288\n")

    def test_stdout_and_stderr_floods_with_blocked_input(self):
        for pipe, length in (("stdout", STDOUT_LIMIT + 1), ("stderr", STDERR_LIMIT + 1)):
            with self.subTest(pipe=pipe):
                source = "sys.%s.buffer.write(b'x' * %d); sys.%s.flush(); time.sleep(60)" % (pipe, length, pipe)
                self.assertIn("collection limit", self.rejected(source, input_text="x" * 1048576, timeout=1))

    def test_silent_child_deadline_also_covers_blocked_stdin(self):
        self.assertIn("deadline", self.rejected("time.sleep(60)", input_text="x" * 1048576, timeout=0.15))

    def test_silent_child_without_stdin_deadline(self):
        self.assertIn("deadline", self.rejected("time.sleep(60)", timeout=0.15))

    def test_closed_output_still_requires_exit_before_deadline(self):
        self.assertIn("deadline", self.rejected("os.close(1); os.close(2); time.sleep(60)", timeout=0.15))

    def test_semantic_exit_modes(self):
        for code in (0, 1, 3):
            source = "print('data'); sys.exit(%d)" % code
            with self.subTest(code=code):
                self.assertEqual(self.run_native(source, semantic_exit=True), "data\n")
                if code:
                    self.rejected(source)
                else:
                    self.assertEqual(self.run_native(source), "data\n")
        self.rejected("print(%r); sys.exit(2)" % SECRET, semantic_exit=True)

    def test_abnormal_exit_and_missing_binary_are_generic(self):
        self.rejected("sys.stderr.write(%r); sys.stderr.flush(); os.abort()" % SECRET)
        with self.assertRaises(CLIENT.ClientError) as caught:
            CLIENT.run_cli(str(ROOT / "does-not-exist-native"), [])
        self.assertNotIn(str(ROOT), str(caught.exception))

    def test_invalid_input_encoding_fails_before_dispatch(self):
        self.rejected("print('not reached')", input_text="\ud800" + SECRET)
        self.assertEqual(self.processes, [])

    def test_early_exit_ignores_unused_input_like_communicate(self):
        self.assertEqual(self.run_native("print('ok')", input_text="x" * 1048576), "ok\n")

    def test_worker_start_failure_reaps_child_and_closes_all_pipes(self):
        start = self.thread_type.start
        for fail_at in (1, 2, 3):
            calls = 0

            def failing_start(worker):
                nonlocal calls
                calls += 1
                if calls == fail_at:
                    raise RuntimeError("cannot start new thread")
                return start(worker)

            with self.subTest(fail_at=fail_at):
                with mock.patch.object(self.thread_type, "start", failing_start):
                    self.rejected("time.sleep(60)", input_text="input", timeout=2)
                self.assertEqual(calls, fail_at)


if __name__ == "__main__":
    unittest.main()
