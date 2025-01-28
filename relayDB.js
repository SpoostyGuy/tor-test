var fetch = require('node-fetch-commonjs')
var net = require('net');
var fs = require('fs')
const { relative } = require('path')
var geoIP = require('offline-geo-from-ip');

function getDistanceFromLatLonInKm(location1, location2) {
    var R = 6371;
    var dLat = deg2rad(location2.latitude-location1.latitude);  // deg2rad below
    var dLon = deg2rad(location2.longitude-location1.longitude); 
    var a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(deg2rad(location1.latitude)) * Math.cos(deg2rad(location2.latitude)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
      ; 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c; // Distance in km
    return d;
}
  
function deg2rad(deg) {
    return deg * (Math.PI/180)
}

async function retrieveRelay(isExit, logger, otherRelay, useLocation) {
    if (!fs.existsSync('./relayDB.json')) {
        logger.subtractCurStage(1)
        logger.connectionMessage(`Finding server to retrieve, db info from`)
        var relayList = undefined

        await fetch('https://onionoo.torproject.org/details', {
            method: 'GET'
        })
            .then(res => res.json())
            .then(response => {
                relayList = response.relays
            })

        var dataBase = []

        relayList.forEach(function(list) {
            if (list.exit_addresses != undefined) {
                dataBase.push(list)
            }
        })
        
        var info = undefined
        var indexDB = 0
        while (true) {
            var db = dataBase[indexDB]
            if (db.exit_addresses != undefined) {
                var address = undefined
                db.exit_addresses.forEach(function(ip) {
                    if (net.isIPv4(ip)) {
                        address = ip
                    }
                })

                logger.subtractCurStage(1)
                logger.connectionMessage('Attempting to retrieve DB info from ' + address + '; ' + db.nickname)
        
                await fetch('http://' + address + '/tor/server/all.z', {
                    method: 'GET',
                    signal: AbortSignal.timeout(5000)
                })
                    .then(res => res.text())
                    .then(response => {
                        info = response
                    })
                    .catch(res => {
                    })
                if (info != undefined) {
                    if (info.split('router ').length > 2) {
                        break
                    }
                }

            }
            indexDB += 1
        }

        logger.subtractCurStage(1)
        logger.connectionMessage('Parsing router info...')
        var routers = []
        var totalCSV = ""
        info.split('router ').forEach(function(routerInfo, index) {
            if (index > 0 && routerInfo.includes('ntor-onion-key')) {
                var name = routerInfo.split(' ')[0]
                var ip = routerInfo.split(' ')[1]
                var location = undefined
                try {
                    location = geoIP.allData(ip)
                } catch(e) {
                }
                if (location != undefined) {
                    if (location.location != undefined) {
                        location = location.location
                    } else {
                        location = undefined
                    }
                } else {
                    location = undefined
                }
                var port = Number(routerInfo.split(' ')[2])
                var publicKey = routerInfo.split('ntor-onion-key ')[1].split('\n')[0]
                
                if (location != undefined) {
                    if (totalCSV.length > 0) {
                        totalCSV += '\n'
                    }
                    var color = (Math.random() * 0xfffff * 1000000).toString(16)
                    totalCSV += location.latitude + ',' + location.longitude  + ',' + name + ',' + '#' + color.slice(0, 6)
                }
                routers.push({
                    name: name,
                    ip: ip,
                    location: location,
                    port: port,
                    publicKey, publicKey,
                    isExit: routerInfo.includes('accept')
                })    
            }
        })

        fs.writeFileSync('./relayDB.json', JSON.stringify({
            routers: routers
        }))

        fs.writeFileSync('./data.csv', totalCSV)
        
        if (useLocation == true) {
            if (isExit == true) {
                var exitRouterList = []
                routers.forEach(function(router) {
                    if (router.isExit == true) {
                        exitRouterList.push(router)
                    }
                })
                if (otherRelay.length == 0) {
                    while (true) {
                        randomRouter = exitRouterList[Math.floor(Math.random()*exitRouterList.length)]
                        if (randomRouter.location != undefined) {
                            break
                        }
                    }
                } else {
                    var totalLocations = []
                    otherRelay.forEach(function(others) {
                        var location = geoIP.allData(others)
                        totalLocations.push({
                            location: location,
                            ip: others
                        })
                    })
                    var lowestAverageDistance = 99999999999
                    var lowestIpData = undefined

                    exitRouterList.forEach(function(routerThing) {
                        if (routerThing.location != undefined) {
                            if (routerThing.location.latitude != undefined) {
                                var average = 0
                                totalLocations.forEach(function(location) {
                                    if (location.ip == routerThing.ip) {
                                        average = true
                                    }
                                    if (average != true) {
                                        average += getDistanceFromLatLonInKm(routerThing.location, location.location.location)
                                    }
                                })

                                if (average != true) {
                                    average = average/totalLocations.length
                                    if (average < lowestAverageDistance) {
                                        lowestAverageDistance = average
                                        lowestIpData = routerThing
                                    }        
                                }
                            }
                        }
                    })
                    randomRouter = lowestIpData
                }
            } else {
                if (otherRelay.length == 0) {
                    while (true) {
                        randomRouter = routers[Math.floor(Math.random()*routers.length)]
                        if (randomRouter.location != undefined) {
                            break
                        }
                    }
                } else {
                    var totalLocations = []
                    otherRelay.forEach(function(others) {
                        var location = geoIP.allData(others)
                        totalLocations.push({
                            location: location,
                            ip: others
                        })
                    })
                    var lowestAverageDistance = 99999999999
                    var lowestIpData = undefined

                    routers.forEach(function(routerThing) {
                        if (routerThing.location != undefined) {
                            if (routerThing.location.latitude != undefined) {
                                var average = 0
                                totalLocations.forEach(function(location) {
                                    if (location.ip == routerThing.ip) {
                                        average = true
                                    }
                                    if (location.location.location == undefined) {
                                        average = true
                                    }
                                    if (average != true) {
                                        average += getDistanceFromLatLonInKm(routerThing.location, location.location.location)
                                    }
                                })

                                if (average != true) {
                                    average = average/totalLocations.length
                                    if (average < lowestAverageDistance) {
                                        lowestAverageDistance = average
                                        lowestIpData = routerThing
                                    }        
                                }
                            }
                        }
                    })
                    randomRouter = lowestIpData
                }
            }
        } else {
            if (isExit == true) {
                var exitRouterList = []
                routers.forEach(function(router) {
                    if (router.isExit == true) {
                        exitRouterList.push(router)
                    }
                })
                while (true) {
                    randomRouter = exitRouterList[Math.floor(Math.random()*exitRouterList.length)]
                    if (!otherRelay.includes(randomRouter.ip)) {
                        break
                    }
                }
            } else {
                while (true) {
                    randomRouter = routers[Math.floor(Math.random()*routers.length)]
                    if (!otherRelay.includes(randomRouter.ip)) {
                        break
                    }
                }
            }
        }

        return {
            ip: randomRouter.ip,
            port: randomRouter.port,
            name: randomRouter.name,
            publicKey: Buffer.from(randomRouter.publicKey, 'base64')
        }


    } else {
        var routers = String(fs.readFileSync('./relayDB.json'))
        routers = JSON.parse(routers).routers


        var randomRouter = undefined
        if (useLocation == true) {
            if (isExit == true) {
                var exitRouterList = []
                routers.forEach(function(router) {
                    if (router.isExit == true) {
                        exitRouterList.push(router)
                    }
                })
                if (otherRelay.length == 0) {
                    while (true) {
                        randomRouter = exitRouterList[Math.floor(Math.random()*exitRouterList.length)]
                        if (randomRouter.location != undefined) {
                            break
                        }
                    }
                } else {
                    var totalLocations = []
                    otherRelay.forEach(function(others) {
                        var location = geoIP.allData(others)
                        totalLocations.push({
                            location: location,
                            ip: others
                        })
                    })
                    var lowestAverageDistance = 99999999999
                    var lowestIpData = undefined

                    exitRouterList.forEach(function(routerThing) {
                        if (routerThing.location != undefined) {
                            if (routerThing.location.latitude != undefined) {
                                var average = 0
                                totalLocations.forEach(function(location) {
                                    if (location.ip == routerThing.ip) {
                                        average = true
                                    }
                                    if (average != true) {
                                        average += getDistanceFromLatLonInKm(routerThing.location, location.location.location)
                                    }
                                })

                                if (average != true) {
                                    average = average/totalLocations.length
                                    if (average < lowestAverageDistance) {
                                        lowestAverageDistance = average
                                        lowestIpData = routerThing
                                    }        
                                }
                            }
                        }
                    })
                    randomRouter = lowestIpData
                }
            } else {
                if (otherRelay.length == 0) {
                    while (true) {
                        randomRouter = routers[Math.floor(Math.random()*routers.length)]
                        if (randomRouter.location != undefined) {
                            break
                        }
                    }
                } else {
                    var totalLocations = []
                    otherRelay.forEach(function(others) {
                        var location = geoIP.allData(others)
                        totalLocations.push({
                            location: location,
                            ip: others
                        })
                    })
                    var lowestAverageDistance = 99999999999
                    var lowestIpData = undefined

                    routers.forEach(function(routerThing) {
                        if (routerThing.location != undefined) {
                            if (routerThing.location.latitude != undefined) {
                                var average = 0
                                totalLocations.forEach(function(location) {
                                    if (location.ip == routerThing.ip) {
                                        average = true
                                    }
                                    if (location.location.location == undefined) {
                                        average = true
                                    }
                                    if (average != true) {
                                        average += getDistanceFromLatLonInKm(routerThing.location, location.location.location)
                                    }
                                })

                                if (average != true) {
                                    average = average/totalLocations.length
                                    if (average < lowestAverageDistance) {
                                        lowestAverageDistance = average
                                        lowestIpData = routerThing
                                    }        
                                }
                            }
                        }
                    })
                    randomRouter = lowestIpData
                }
            }
        } else {
            if (isExit == true) {
                var exitRouterList = []
                routers.forEach(function(router) {
                    if (router.isExit == true) {
                        exitRouterList.push(router)
                    }
                })
                while (true) {
                    randomRouter = exitRouterList[Math.floor(Math.random()*exitRouterList.length)]
                    if (!otherRelay.includes(randomRouter.ip)) {
                        break
                    }
                }
            } else {
                while (true) {
                    randomRouter = routers[Math.floor(Math.random()*routers.length)]
                    if (!otherRelay.includes(randomRouter.ip)) {
                        break
                    }
                }
            }
        }

        return {
            ip: randomRouter.ip,
            port: randomRouter.port,
            name: randomRouter.name,
            publicKey: Buffer.from(randomRouter.publicKey, 'base64')
        }
    }
}

module.exports = {
    retrieveRelay,
    getDistanceFromLatLonInKm
}