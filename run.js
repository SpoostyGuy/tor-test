var Circuit = require('./circuit')

async function run() {
    var main = undefined
    var attempts = 0
    while (true) {
        attempts += 1
        main = new Circuit.Circuit()
        var startTime = Date.now()
        var isEstablished = await main.connect(true, startTime, attempts)
        if (isEstablished == true) {
            break
        } else {
            await main.tearDown()
        }
    }
}

run()