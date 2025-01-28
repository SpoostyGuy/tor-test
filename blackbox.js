var fetch = require('node-fetch-commonjs')
var fs = require('fs')

function finditer(regex, string) {
    let match;
    const matches = [];
  
    while ((match = regex.exec(string)) !== null) {
        matches.push(match);
    }
  
    return matches;
}

class BlackboxSession {
    constructor(proxy, systemMsg) {
        this.proxy = proxy
        this.messageHistory = []
        this.headers = {
            'accept': '*/*',
            'accept-language': 'en-US,en;q=0.9',
            'content-type': 'application/json',
            'origin': 'https://www.blackbox.ai',
            'referer': 'https://www.blackbox.ai/',
            'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        }
    }

    async fetch_validated() {
        if (!fs.existsSync('./storage.json')) {
            var response = await fetch('https://www.blackbox.ai', {
                agent: this.proxy,
                headers: this.headers,
                method: "GET"
            })
                .then(res => res.text())
    
            var jsFiles = []
            response.split("static/chunks/").forEach(function(data, index) {
                if (index > 0) {
                    if (!isNaN(Number(data.split(".js")[0].split("-")[0]))) {
                        data = "static/chunks/" + data.split(".js")[0] + '.js'
                        if (!data.includes("app")) {
                            jsFiles.push(data)
                        }
                    }
                }
            })
            var curIndex = 0
            for (var file in jsFiles) {
                file = jsFiles[file]
                var url = "https://www.blackbox.ai/_next/" + file
                var status = undefined
                var responseJS = await fetch(url, {
                    agent: this.proxy,
                    headers: this.headers,
                    method: "GET"
                })
                    .then(res => {
                        status = res.status
                        return res.text()
                    })
                if (status == 200) {
                    console.log('retrieved response')
                    console.log(curIndex)
                    var matches = responseJS.match(/"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/g)
                    if (matches != null) {
                        for (var match in matches) {
                            match = matches[match]
                            var index = responseJS.indexOf(match)
                            var start = Math.max(0, (index-10))
                            var end = Math.min(responseJS.length, (index+match.length+10))
                            var context = responseJS.slice(start, end)
                            var found = false
                            "abcdefghijklmnopqrstuvwxyz".split('').forEach(function(dat) {
                                if (context.includes(dat + '=')) {
                                    found = true
                                }
                            })
                            if (found == true) {
                                match = match.replaceAll('"', '')
                                fs.writeFileSync('./storage.json', JSON.stringify({
                                    validation_uuid: match
                                }))
                                return match
                            }
                        }
                    }
                }
                curIndex += 1
            }    
        } else {
            var data = fs.readFileSync('./storage.json')
            data = JSON.parse(
                String(data)
            )
            return data.validation_uuid
        }
        
    }

    genId() {
        var id = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split("")
        var stringId = ""
        for (var i = 0; i < 7; i++) {
            stringId += id[Math.floor(Math.random()*(id.length-1))]
        }
        return stringId
    }

    async getCompletion(text) {
        var validated = await this.fetch_validated()
        var messageId = this.genId()


        this.messageHistory.push({"id": messageId, "content": text, "role": "user"})
        var jsonSend = {
            "messages": this.messageHistory,
            "agentMode": {},
            "id": messageId,
            "previewToken": undefined,
            "userId": undefined,
            "codeModelMode": false,
            "trendingAgentMode": {},
            "isMicMode": false,
            "userSystemPrompt": undefined,
            "maxTokens": undefined,
            "playgroundTopP": undefined,
            "playgroundTemperature": undefined,
            "isChromeExt": false,
            "githubToken": "",
            "clickedAnswer2": false,
            "clickedAnswer3": false,
            "clickedForceWebSearch": false,
            "visitFromDelta": false,
            "mobileClient": false,
            "userSelectedModel": "gpt-4o",
            "validated": validated,
            "imageGenerationMode": false,
            "webSearchModePrompt": false,
            "deepSearchMode": false,
            "domains": undefined,
            "vscodeClient": false,
            "codeInterpreterMode": false,
            "webSearchMode": false
        }

        var response = await fetch('https://www.blackbox.ai/api/chat', {
            agent: this.proxy,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': JSON.stringify(jsonSend).length,
                ...this.headers
            },
            body: JSON.stringify(jsonSend),
            method: "POST"
        })
        var previousBody = ""
        var timeTook = Date.now()
        var numberOfTokens = 0
        process.stdout.write("\r\x1b[K")
        for await (const chunk of response.body) {
            previousBody += chunk.toString()
            numberOfTokens += 1
            process.stdout.write(chunk)
        }
        
        this.messageHistory.push({"id": this.genId(), "content": previousBody, "role": "assistant"})
        return previousBody

    }
}

module.exports = {
    BlackboxSession
}