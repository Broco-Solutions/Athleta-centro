#!/usr/bin/bash

set -u

fail() {
  printf '[PILOT_ISOLATION] %s\n' "$1" >&2
  exit "${2:-70}"
}

if ((BASH_VERSINFO[0] < 5 || (BASH_VERSINFO[0] == 5 && BASH_VERSINFO[1] < 2))); then
  fail 'Bash 5.2 or newer is required'
fi

case "${1:-}" in
  launch)
    shift
    (($# >= 2)) || fail 'invalid containment launch arguments'
    expected_parent=$1
    shift
    [[ $expected_parent =~ ^[1-9][0-9]*$ ]] || fail 'invalid expected supervisor PID'
    ((PPID == expected_parent)) || fail 'Bootstrap supervisor exited before containment was armed'
    [[ $1 == /usr/bin/unshare ]] || fail 'invalid containment launcher'
    exec "$@"
    ;;

  init)
    shift
    (($# == 14)) || fail 'invalid closed init arguments'
    ((BASHPID == 1)) || fail 'Bootstrap init is not PID 1'
    [[ $1 == /* && $2 == /* ]] || fail 'invalid Bootstrap driver command'

    node_executable=$1
    driver=$2
    shift 2

    driver_pid=''
    forward_term() {
      if [[ -n $driver_pid ]]; then
        kill -TERM "$driver_pid" 2>/dev/null || true
      fi
    }
    trap forward_term TERM

    "$node_executable" "$driver" "$@" &
    driver_pid=$!

    while true; do
      completed_pid=''
      wait -n -p completed_pid
      completed_status=$?

      if [[ -n $completed_pid && $completed_pid == "$driver_pid" ]]; then
        exit "$completed_status"
      fi

      # A trapped signal can interrupt wait without completing a child. If the
      # driver ended in that window, collect its real status before PID 1 exits.
      if ! kill -0 "$driver_pid" 2>/dev/null; then
        wait "$driver_pid"
        exit $?
      fi
    done
    ;;

  *)
    fail 'invalid containment mode'
    ;;
esac
