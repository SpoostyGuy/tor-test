const net = require('net');
var Circuit = require('../circuit')
const { SocksProxyAgent } = require('socks-proxy-agent');
var https = require('https')
var fetch = require('node-fetch-commonjs')
var curCircuit = undefined

async function run() {
    var attempts = 0
    var main = undefined
    var startTime = Date.now()
    while (true) {
        attempts += 1
        main = new Circuit.Circuit()
        var established = await main.connect(true, startTime, attempts)
        if (established == true) {
            return main
        } else {
            await main.tearDown()
        }
    }
}

var usedStreamIds = []

const server = net.createServer((socket) => {
    var streamId = undefined
    var stage = 0
    socket.on('error', function(e) {
        console.log(e)
    })
    socket.on('data', async function(data) {
        if (data.readUint8(0) == 5 && stage == 0) {
            if (curCircuit != undefined) {
                stage = 1
                socket.write(Buffer.from([5, 0]))    
            } else {
                socket.destroy()
            }
        } else {
            if (data.readUint8(0) == 5 && stage == 1) {
                var offsetCur = 3
                var type = data.readUint8(offsetCur)
                offsetCur += 1
                if (type == 0x01) {
                    var dataIp = data.slice(offsetCur, offsetCur+4)
                    dataIp = 
                    offsetCur += 4
                    var port = data.readUint16BE(offsetCur)
                    
                } else {
                    var len = data.readUint8(offsetCur)
                    offsetCur += 1
                    var dataHost = data.slice(offsetCur, offsetCur+len)
                    offsetCur += len
                    var port = data.readUint16BE(offsetCur)
                    while (true) {
                        streamId = Math.floor(Math.random()*60000)
                        if (streamId < 1) {
                            streamId = 1
                        }
                        if (usedStreamIds[streamId] == undefined) {
                            break
                        }
                    }

                    var resolved = await curCircuit.connectToHost(String(dataHost), port, streamId)
                    if (resolved.length == 8) {
                        var sendBack = Buffer.from([0x05, 0x00, 0x00, 0x01])
                        sendBack = Buffer.concat([sendBack, resolved.slice(0, 4), Buffer.alloc(2)])
                        sendBack.writeUint16BE(port, sendBack.length-2)
                        stage = 2
                        curCircuit.handleCallback(function(data) {
                            if (data.ended != undefined) {
                                socket.destroy()
                            } else {
                                socket.write(data)
                            }
                        }, streamId)
                        socket.write(sendBack)
                    }
                }
            } else {
                if (stage == 2) {
                    await curCircuit.writeTLS(data, streamId)
                }
            }
        }
    })
    socket.on('close', function() {
        if (streamId != undefined) {
            curCircuit.endRelayStream(streamId)
        }
    })
});

var { BlackboxSession } = require('./blackbox')
// Listen on port 3000
server.listen(3000, async () => {
    curCircuit = await run()    
    var agent = new SocksProxyAgent(
        'socks://127.0.0.1:3000'
    );
    var session = new BlackboxSession(
        agent,
    )
    var readline = require('readline') 
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    var isDone = true
    process.stdout.write("> ")

    rl.on('line', async function(data) {
        if (isDone == true) {
            isDone = false
            await session.getCompletion(data)
            process.stdout.write("\n> ")
            isDone = true
        }

    })
});

process.on('SIGINT', () => {
    if (curCircuit != undefined) {
        curCircuit.tearDown()
        console.log('tore down')
    }
    // Perform cleanup tasks here if necessary
    process.exit(); // Exit the process gracefully
});
  