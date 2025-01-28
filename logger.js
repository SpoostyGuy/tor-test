var fs = require('fs')

class Logger {
    constructor() {
        this.STAGES = 15
        this.CURSTAGE = 0
        this.LOOP_STARTED = false
        this.CUR_MESSAGE = undefined
    }
    async internalLoop() {
        var isFirst = false
        var loadingArray = ["⣾","⣽","⣻","⢿","⡿","⣟","⣯","⣷"]
        var curIndex = 0
        var currentWait = 0
        while (this.LOOP_STARTED) {
            if (isFirst == false) {
                if (loadingArray[curIndex] == undefined) {
                    curIndex = 0
                }
                isFirst = true
                process.stdout.write(loadingArray[curIndex] + ' ' + this.CUR_MESSAGE)
            } else {
                if (loadingArray[curIndex] == undefined) {
                    curIndex = 0
                }
                process.stdout.write("\r\x1b[K")
    
                process.stdout.write(loadingArray[curIndex] + ' ' + this.CUR_MESSAGE)
            }
            if (currentWait >= 5) {
                curIndex += 1
                currentWait = 0
            }
            currentWait += 1
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        process.stdout.write("\r\x1b[K")
        this.LOOP_STARTED = true

    }
    subtractCurStage(amount) {
        this.CURSTAGE = this.CURSTAGE - amount
    }
    connectionMessage(message) {
        this.CURSTAGE = this.CURSTAGE +  1
        this.CUR_MESSAGE = ("Bootstrapping " + Math.floor((this.CURSTAGE/this.STAGES)*100) + '%: ' + message)
        if (this.LOOP_STARTED == false) {
            this.LOOP_STARTED = true
            this.internalLoop()
        }
    }
    async finished() {
        this.LOOP_STARTED = false
        while (true) {
            if (this.LOOP_STARTED == true) {
                break
            }
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
    resetStages() {
        this.CURSTAGE = 0
    }
}

module.exports = {
    Logger
}