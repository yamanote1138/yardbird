#!/usr/bin/env node
/**
 * WebSocket-to-TCP proxy for DCC-EX EX-CommandStation.
 *
 * Bridges browser WebSocket connections to the DCC-EX WiThrottle server
 * running on raw TCP. One TCP connection per WebSocket client.
 *
 * Usage:
 *   node dccex-ws-proxy.mjs [--ws-port 2561] [--dccex-host 192.168.1.231] [--dccex-port 2560]
 */

import net from 'net'
import { WebSocketServer } from 'ws'
import { parseArgs } from 'util'

const { values: args } = parseArgs({
  options: {
    'ws-port':    { type: 'string', default: '2561' },
    'dccex-host': { type: 'string', default: '192.168.1.231' },
    'dccex-port': { type: 'string', default: '2560' },
  }
})

const WS_PORT = parseInt(args['ws-port'])
const DCCEX_HOST = args['dccex-host']
const DCCEX_PORT = parseInt(args['dccex-port'])

const wss = new WebSocketServer({ port: WS_PORT })

console.log(`DCC-EX WS proxy listening on ws://0.0.0.0:${WS_PORT}`)
console.log(`Relaying to DCC-EX at ${DCCEX_HOST}:${DCCEX_PORT}`)

wss.on('connection', (ws, req) => {
  const clientAddr = req.socket.remoteAddress
  console.log(`[${clientAddr}] WS client connected`)

  // DCC-EX classifies connections by the first message:
  //   starts with '<' → native command parser
  //   anything else   → WiThrottle parser
  // We need BOTH: WiThrottle for throttles, native for power (DC tracks).
  // Solution: two TCP connections, one for each parser.

  const tcpWT = net.createConnection(DCCEX_PORT, DCCEX_HOST)   // WiThrottle
  const tcpNative = net.createConnection(DCCEX_PORT, DCCEX_HOST) // Native commands

  let wtReady = false
  let nativeReady = false

  tcpWT.on('connect', () => {
    console.log(`[${clientAddr}] WiThrottle TCP connected`)
    tcpWT.setNoDelay(true)
    wtReady = true
  })

  tcpNative.on('connect', () => {
    console.log(`[${clientAddr}] Native TCP connected`)
    tcpNative.setNoDelay(true)
    nativeReady = true
  })

  // Forward WiThrottle responses to browser
  tcpWT.on('data', (data) => {
    const str = data.toString()
    console.log(`[${clientAddr}] WT  <<< ${str.trimEnd()}`)
    if (ws.readyState === 1) ws.send(str)
  })

  // Forward native responses to browser
  tcpNative.on('data', (data) => {
    const str = data.toString()
    console.log(`[${clientAddr}] NAT <<< ${str.trimEnd()}`)
    if (ws.readyState === 1) ws.send(str)
  })

  // Route browser messages to the correct TCP connection
  ws.on('message', (data) => {
    const str = data.toString()
    console.log(`[${clientAddr}] WS  >>> ${str.trimEnd()}`)

    if (str.trimStart().startsWith('<')) {
      if (nativeReady && !tcpNative.destroyed) tcpNative.write(str)
    } else {
      if (wtReady && !tcpWT.destroyed) tcpWT.write(str)
    }
  })

  const cleanup = () => {
    tcpWT.end()
    tcpNative.end()
  }

  ws.on('close', () => {
    console.log(`[${clientAddr}] WS client disconnected`)
    cleanup()
  })

  tcpWT.on('close', () => console.log(`[${clientAddr}] WT TCP closed`))
  tcpNative.on('close', () => console.log(`[${clientAddr}] Native TCP closed`))

  tcpWT.on('error', (err) => {
    console.error(`[${clientAddr}] WT TCP error: ${err.message}`)
    if (ws.readyState === 1) ws.close(1011, 'DCC-EX connection failed')
  })

  tcpNative.on('error', (err) => {
    console.error(`[${clientAddr}] Native TCP error: ${err.message}`)
  })

  ws.on('error', (err) => {
    console.error(`[${clientAddr}] WS error: ${err.message}`)
    cleanup()
  })
})
