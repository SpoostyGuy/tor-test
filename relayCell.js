
var crypto_utils = require('./crypto_utils')

function addZeros(buf, len) {
    return Buffer.concat([buf, Buffer.alloc(len)])
}

function attemptDecrypt(circuit, beforeBody) {
    var countIncrease = 0
    var body = beforeBody.slice()
    var otherBody = circuit.dataBefore
    if (otherBody != undefined) {    
        otherBody = otherBody.slice()
    }
    circuit.keyLayers.forEach(function(key, index) {
        if (otherBody != undefined) {
            if (index <= (circuit.lenUse-1)) {
                otherBody = key.backwardKey.before.update(otherBody)
            }
        }
        body = key.backwardKey.main.update(body)
    })
    circuit.dataBefore = beforeBody
    circuit.lenUse = circuit.keyLayers.length
    if (body.readUint16BE(1) != 0) {
        console.log('failed')
    } else {
        return body
    }
    
}
class RelayCell {
    constructor(circuit) {
        this.circuit = circuit
    }
    parse(data, beforeDecryptRes) {

        var body = data.slice()

        body = attemptDecrypt(this.circuit, body)

        var hashDigest = body.slice()
        hashDigest.writeUint8(0, 5)
        hashDigest.writeUint8(0, 6)
        hashDigest.writeUint8(0, 7)
        hashDigest.writeUint8(0, 8)
        var digestWork = this.circuit.keyLayers[this.circuit.keyLayers.length-1].backwardDigest
        digestWork.update(hashDigest)
        var totalDigest = digestWork.copy().digest()

        var offset = 0
        var returnData = {}
        returnData["RelayCommand"] = body.readUint8(offset)
        returnData["Digest"] = totalDigest
        offset += 3
        returnData["StreamID"] = body.readUint16BE(offset)
        offset += 6
        var len = body.readUint16BE(offset)
        offset += 2
        returnData["Body"] = body.slice(offset, offset+len)
        return {
            returnData,
            beforeDecrypt: this.circuit.keyLayers,
            encrypted: data
        }
    }
    buildBody(data) {
        var digest = this.circuit.keyLayers[this.circuit.keyLayers.length-1].fowardDigest
        var totalBody = Buffer.alloc(0)
        var curOffset = 0

        totalBody = addZeros(totalBody, 1)
        totalBody.writeUint8(data["RelayCommand"], curOffset)
        curOffset += 1
        totalBody = addZeros(totalBody, 2)
        totalBody.writeUint16BE(0, curOffset)
        curOffset += 2
        totalBody = addZeros(totalBody, 2)
        totalBody.writeUint16BE(data["StreamID"], curOffset)
        curOffset += 2
        totalBody = Buffer.concat([totalBody, Buffer.alloc(4)])
        curOffset += 4
        totalBody = addZeros(totalBody, 2)
        totalBody.writeUint16BE(data["Body"].length, curOffset)
        curOffset += 2
        totalBody = Buffer.concat([totalBody, data["Body"], Buffer.alloc(509-11-data["Body"].length)])

        digest.update(totalBody)
        var sha1 = digest.copy().digest()
        sha1 = sha1.slice(0, 4)
        
        var otherBody = Buffer.alloc(0)
        var otherOffset = 0

        otherBody = addZeros(otherBody, 1)
        otherBody.writeUint8(data["RelayCommand"], otherOffset)
        otherOffset += 1
        otherBody = addZeros(otherBody, 2)
        otherBody.writeUint16BE(0, otherOffset)
        otherOffset += 2
        otherBody = addZeros(otherBody, 2)
        otherBody.writeUint16BE(data["StreamID"], otherOffset)
        otherOffset += 2
        otherBody = Buffer.concat([otherBody, sha1])
        otherOffset += 4
        otherBody = addZeros(otherBody, 2)
        otherBody.writeUint16BE(data["Body"].length, otherOffset)
        otherOffset += 2
        otherBody = Buffer.concat([otherBody, data["Body"], Buffer.alloc(509-11-data["Body"].length)])

        this.circuit.keyLayers.slice().reverse().forEach(function(key, index) {
            if (index == 1) {
                otherBody = crypto_utils.aesCrypt(key.fowardKey, otherBody, 0)
            } else {
                otherBody = crypto_utils.aesCrypt(key.fowardKey, otherBody, 0)
            }
        })

        return otherBody
    }
}

module.exports = {
    RelayCell
}