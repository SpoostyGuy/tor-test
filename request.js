var { RelayCell } = require('./relayCell')
var utils = require('./crypto_utils')
var types = require('./cell_types')
const HTTPTag = require('http-tag')
var totalCallbacks = {}
var streamCallbackForId = {}
var totalCellCap = 0

async function connect(circuit, ip, port, streamId) {
    var data = Buffer.concat([Buffer.from(ip), Buffer.from(":"), Buffer.from(port.toString()), Buffer.from([0])])
    data = Buffer.concat([data, Buffer.alloc(1)])
    var resData = new RelayCell(circuit).buildBody({
        RelayCommand: 1,
        StreamID: streamId,
        Body: data
    })
    totalCellCap += 1
    var response = await waitForCallbackAndSendData(
        circuit,
        new types.Cell().buildCell(3, resData, circuit.circuitId, true),
        streamId
    )
    return response
}

async function waitForCallbackAndSendData(circuit, data, streamId) {
    return new Promise((resolve,reject) => {
        streamCallbackForId[streamId] = function(resData) {
            resolve(resData)
        }
        circuit.socket.write(data)
    })
}

var previousDecrypt = undefined
var totalCellRecieve = 0
var previousCellDecrypt = undefined

async function handleTotalCallbacks(circuit) {
    circuit.onCells = function(callbackThing) {
        if (callbackThing['3'] != undefined) {
            if (Array.isArray(callbackThing['3'])) {
                var totalDataForStreamId = {}
                callbackThing['3'].forEach(function(dat) {
                    //console.log("COMMAND: " + dat.returnData["RelayCommand"])
                    if (dat.returnData["RelayCommand"] == 2) {
                        totalCellRecieve += 1
                        if (totalCellRecieve >= 100) {
                            totalCellRecieve = 0
                            var digestRes = dat.returnData["Digest"]
                            //console.log(digestRes)
                            var bufData = Buffer.alloc(3)
                            bufData.writeUint8(0x01, 0)
                            bufData.writeUint16BE(digestRes.length, 1)
                            bufData = Buffer.concat([bufData, digestRes])

                            var resData2 = new RelayCell(circuit).buildBody({
                                RelayCommand: 5,
                                StreamID: 0,
                                Body: bufData
                            })

                            circuit.socket.write(circuit.cellHandler.buildCell(3, resData2, circuit.circuitId, true))                
                        }    
                        if (totalCallbacks[dat.returnData["StreamID"]] != undefined) {
                            if (totalDataForStreamId[dat.returnData["StreamID"]] == undefined) {
                                totalDataForStreamId[dat.returnData["StreamID"]]  = Buffer.alloc(0)
                            }
                            totalDataForStreamId[dat.returnData["StreamID"]] = Buffer.concat([totalDataForStreamId[dat.returnData["StreamID"]], dat.returnData.Body])
                        }
                    } else {
                        if (dat.returnData["RelayCommand"] == 3) {
                            if (streamCallbackForId[dat.returnData["StreamID"]] != undefined) {
                                streamCallbackForId[dat.returnData["StreamID"]]({
                                    ended: true
                                })
                            }
                        } else {
                            if (streamCallbackForId[dat.returnData["StreamID"]] != undefined) {
                                streamCallbackForId[dat.returnData["StreamID"]](dat.returnData.Body)
                            }    
                        }
                    }
                    previousCellDecrypt = dat.encrypted
                })
                if (Object.keys(totalDataForStreamId).length == 0) {
                }
                for (var key in totalDataForStreamId) {
                    if (totalCallbacks[key] != undefined) {
                        totalCallbacks[key](totalDataForStreamId[key])
                    }
                }
            } else {
                //console.log("COMMAND: " + callbackThing['3'].returnData["RelayCommand"])
                previousDecrypt = callbackThing['3'].returnData.beforeDecrypt
                if (callbackThing['3'].returnData["RelayCommand"] == 2) {
                    totalCellRecieve += 1
                    if (totalCellRecieve >= 100) {
                        totalCellRecieve = 0
                        var digestRes = callbackThing['3'].returnData["Digest"]
                        //console.log(digestRes)
                        var bufData = Buffer.alloc(3)
                        bufData.writeUint8(0x01, 0)
                        bufData.writeUint16BE(digestRes.length, 1)
                        bufData = Buffer.concat([bufData, digestRes])

                        var resData2 = new RelayCell(circuit).buildBody({
                            RelayCommand: 5,
                            StreamID: 0,
                            Body: bufData
                        })
                                
                        circuit.socket.write(circuit.cellHandler.buildCell(3, resData2, circuit.circuitId, true))                
                    }
                    if (totalCallbacks[callbackThing['3'].returnData["StreamID"]] != undefined) {
                        totalCallbacks[callbackThing['3'].returnData["StreamID"]](callbackThing['3'].returnData.Body)
                    } else {
                    }
                } else {
                    if (callbackThing['3'].returnData["RelayCommand"] == 3) {
                        if (streamCallbackForId[callbackThing['3'].returnData["StreamID"]] != undefined) {
                            streamCallbackForId[callbackThing['3'].returnData["StreamID"]]({
                                ended: true
                            })
                        }
                    } else {
                        if (streamCallbackForId[callbackThing['3'].returnData["StreamID"]] != undefined) {
                            streamCallbackForId[callbackThing['3'].returnData["StreamID"]](callbackThing['3'].returnData.Body)
                        }    
                    }
                }
                previousCellDecrypt = callbackThing['3'].encrypted
            }
        }
    }
}

async function endRelayStream(circuit, streamId) {
    var resData2 = new RelayCell(circuit).buildBody({
        RelayCommand: 3,
        StreamID: streamId,
        Body: Buffer.from([6])
    })
    
    circuit.socket.write(circuit.cellHandler.buildCell(3, resData2, circuit.circuitId, true))
    //console.log('ending stream')
}

async function resolveDNS(circuit, name, streamId) {
    var name = Buffer.concat([Buffer.from(name), Buffer.from([0])])
    var resData = new RelayCell(circuit).buildBody({
        RelayCommand: 11,
        StreamID: 1,
        Body: name
    })
    var response = new types.Cell(circuit, true).decodeCell(
        await circuit.writeAndWaitForResponse(
            new types.Cell().buildCell(3, resData, circuit.circuitId, true)
        )
    )['3'].returnData.Body
    var dnsAdressess = []
    var curOffset = 0
    while (true) {
        var type = response.readUint8(curOffset)
        curOffset += 1
        var bodyLen = response.readUint8(curOffset)
        curOffset += 1
        var body = response.slice(curOffset, curOffset+bodyLen)
        curOffset += bodyLen
        if (type == 4) {
            var bodyNew = body.readUint8(0) + '.' + body.readUint8(1) + '.' + body.readUint8(2) + '.' + body.readUint8(3)
            dnsAdressess.push({
                type: 'ipv4',
                address: bodyNew,
                rawAddress: body
            })
        } else {
            if (type == 6) {
                dnsAdressess.push({
                    type: 'ipv6',
                    rawAddress: body
                })
            }
        }
        curOffset += 4
        if (response.length >= curOffset) {
            break
        }
    }
    return dnsAdressess
}

async function writeTLS(circuit, data, streamId) {
    if (data.length > 498) {
        var len = (data.length/498)
        var totalCircuitBody = Buffer.alloc(0)
        if (len > Math.floor(len)) {
            var curOffset = 0
            for (var i = 0; i < Math.floor(len); i ++) {
                var resData2 = new RelayCell(circuit).buildBody({
                    RelayCommand: 2,
                    StreamID: streamId,
                    Body: data.slice(curOffset, curOffset+498)
                })
                curOffset += 498
                
                totalCircuitBody = Buffer.concat([totalCircuitBody, circuit.cellHandler.buildCell(3, resData2, circuit.circuitId, true)])
            }
            var resData3 = new RelayCell(circuit).buildBody({
                RelayCommand: 2,
                StreamID: streamId,
                Body: data.slice(curOffset)
            })
    
            totalCircuitBody = Buffer.concat([totalCircuitBody, circuit.cellHandler.buildCell(3, resData3, circuit.circuitId, true)])
        } else {
            var curOffset = 0
            for (var i = 0; i < Math.floor(len); i ++) {
                var resData2 = new RelayCell(circuit).buildBody({
                    RelayCommand: 2,
                    StreamID: streamId,
                    Body: data.slice(curOffset, curOffset+498)
                })
                curOffset += 498
                
                totalCircuitBody = Buffer.concat([totalCircuitBody, circuit.cellHandler.buildCell(3, resData2, circuit.circuitId, true)])
            }
        }
        //console.log("SENDING:")
        //console.log(totalCircuitBody.length)
        circuit.socket.write(totalCircuitBody)
    } else {
        var resData2 = new RelayCell(circuit).buildBody({
            RelayCommand: 2,
            StreamID: streamId,
            Body: data
        })

        //console.log("SENDING")
        //console.log(resData2.length)

        circuit.socket.write(circuit.cellHandler.buildCell(3, resData2, circuit.circuitId, true))
    }
}

async function handleCallback(callback, streamId) {
    totalCallbacks[streamId] = callback
}

module.exports = {
    resolveDNS,
    connect,
    handleTotalCallbacks,
    endRelayStream,
    handleCallback,
    writeTLS
}