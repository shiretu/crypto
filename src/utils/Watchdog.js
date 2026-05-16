// Thin wrapper around systemd's sd_notify watchdog protocol.
// Outside systemd (NOTIFY_SOCKET unset) every call is a no-op.
// Caller decides when to pet().

import { spawn } from 'child_process'

export default class Watchdog {
    #enabled = !!process.env.NOTIFY_SOCKET

    constructor () {
        // Type=notify units need READY=1 once to leave 'activating' state.
        this.#send('--ready')
    }

    pet (status) {
        this.#send('WATCHDOG=1')
        if (status != null) this.#send(`--status=${status}`)
    }

    #send (arg) {
        if (!this.#enabled) return
        const child = spawn('systemd-notify', [arg], { stdio: 'ignore' })
        child.on('error', () => { /* systemd-notify missing — ignore */ })
    }
}
