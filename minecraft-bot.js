/* 

Minecraft Farming/Carpeting Bot 

Version 1.0

Copyright (C) 2023 Maxim Masiutin. All rights reserved

This is a very simple bot that demonstrates the use of the mineflayer library.

Watch demos:

 - Farming (plant/harvest wheat): https://youtu.be/RVaNNiG96-M
 - Carpeting (fill surface with a white carpet): https://youtu.be/tKTukPgVf7Q

Run the bot:

 - node minecraft-bot.js <username> <server-version> <server-ip> <server-port>

Control the bot:

 - the bot is by default in idle mode; whisper a command to the bot; valid commands are:
   - idle (just wave hands occasionally)
   - stop (the same as idle, stop current activity)
   - farm (plant/harvest wheat)
   - carpet (fill surface with white carpets)
  e.g., if your bot has username "Glomik", use in Minecraft "/tell Glomik farm"

*/

'use strict'

function main () {
  let ArgUsername = 'user'
  let ArgVersion = '1.16.5'
  let ArgHost = '127.0.0.1'
  let ArgPort = 25565

  const { Vec3 } = require('vec3')
  const mineflayer = require('mineflayer')
  const pathfinder = require('mineflayer-pathfinder').pathfinder
  const Movements = require('mineflayer-pathfinder').Movements
  const { GoalNear } = require('mineflayer-pathfinder').goals

  const CFindBlocksToReturnCarpeting = 128
  const CFindBlocksToReturnFarmingToHarvest = 128
  const CFindBlocksToReturnFarmingToSow = 128

  const CStateIdle = 1
  const CStateFarming = 2
  const CStateBuilding = 3
  const CStateCarpeting = 4

  const CStateAfterSpawn = CStateIdle

  let CurrentState = null
  let timerHandle = null

  const CMoveTimeout = 100
  const CWaitForCropsToGrowTimeout = 10000
  const CWaitIdleTimeout = 3000

  const CMaxDistance = 70
  const CWheatGrownMetadata = 7

  let bot = null

  let farmland_id = null
  let air_id = null
  let wheat_id = null
  let wheat_crop_id = null
  let wheat_seed_id = null
  let potato_crop_id = null
  let potato_seed_id = null
  let carrot_crop_id = null
  let carrot_seed_id = null
  let white_carpet_id = null
  let cobblestone_id = null

  const faceVectorUp = new Vec3(0, 1, 0)
  const faceVectorDown = new Vec3(0, -1, 0)
  const faceVectorSouth = new Vec3(0, 0, 1)
  const faceVectorNorth = new Vec3(0, 0, -1)
  const faceVectorEast = new Vec3(1, 0, 0)
  const faceVectorWest = new Vec3(-1, 0, 0)

  if (process.argv.length > 2) {
    ArgUsername = process.argv[2]
  }

  if (process.argv.length > 3) {
    ArgVersion = process.argv[3]
  }

  if (process.argv.length > 4) {
    ArgHost = process.argv[4]
  }

  if (process.argv.length > 5) {
    ArgPort = process.argv[5]
  }

  createBotInstance()

  function nowStr () {
    const nowDate = new Date()
    return nowDate.toISOString()
  }

  function createBotInstance () {
    console.log(nowStr(), 'Username', ArgUsername, 'Version', ArgVersion, 'Host', ArgHost, 'Port', ArgPort)

    try {
      bot = mineflayer.createBot({
        host: ArgHost,
        port: ArgPort,
        version: ArgVersion,
        username: ArgUsername,
        auth: 'microsoft',
        hideErrors: false,
        checkTimeoutInterval: 120000,
        keepAlive: true
      })
    } catch (e) {
      console.log(nowStr(), e)
      process.exit(1)
    }
    bot.loadPlugin(pathfinder)
    bot.on('error', bot_on_error)
    bot.once('spawn', spawn)
  }

  function bot_on_error (e) {
    console.log(nowStr(), 'bot_on_error', e)
  }

  function bot_on_experience () {
    bot.chat(`I am level ${bot.experience.level}`)
  }

  function ConfigureMovements () {
    let defaultMovements = new Movements(bot)
    defaultMovements.allow1by1towers = false // Do not build 1x1 towers when going up
    defaultMovements.canDig = false // Disable breaking of blocks when pathing
    defaultMovements.allowFreeMotion = false
    defaultMovements.allowEntityDetection = false
    defaultMovements.carpets.add(wheat_crop_id)
    defaultMovements.blocksToAvoid.delete(wheat_crop_id)
    defaultMovements.allowSprinting = false
    bot.pathfinder.setMovements(defaultMovements) // Update the movement instance pathfinder uses
  }

  function ConfigureIds () {
    farmland_id = bot.registry.blocksByName.farmland.id
    air_id = bot.registry.blocksByName.air.id
    wheat_crop_id = bot.registry.blocksByName.wheat.id
    wheat_seed_id = bot.registry.itemsByName.wheat_seeds.id
    wheat_id = bot.registry.itemsByName.wheat.id
    potato_crop_id = bot.registry.blocksByName.potatoes.id
    potato_seed_id = bot.registry.itemsByName.potato.id
    carrot_crop_id = bot.registry.blocksByName.carrots.id
    carrot_seed_id = bot.registry.itemsByName.carrot.id
    white_carpet_id = bot.registry.itemsByName.white_carpet.id
    cobblestone_id = bot.registry.itemsByName.cobblestone.id
  }

  function ConfigureEvents () {
    bot.on('experience', bot_on_experience)
    bot.on('whisper', bot_on_whisper)
  }

  function after_spawn () {
    ConfigureIds()
    ConfigureMovements()
    ConfigureEvents()
    switchStateTo(CStateAfterSpawn)
  }

  function spawn () {
    console.log(nowStr(), 'Spawned!!!')
    bot
      .waitForChunksToLoad()
      .then(() => {
        console.log(nowStr(), 'Chunks loaded!!!')
        setImmediate(after_spawn)
      })
      .catch(err => {
        console.log(nowStr(), 'Could not load chunks', err)
        process.exit(1)
      })
  }

  function clearTimer () {
    if (timerHandle) {
      clearTimeout(timerHandle)
      timerHandle = null
    }
  }

  function setTimer (ADelay) {
    timerHandle = setTimeout(loop, ADelay)
  }

  function setAgain () {
    setImmediate(loop)
  }

  function clearStates () {
    idleState.clear()
    farmingState.clear()
    buildingState.clear()
    carpetingState.clear()
  }

  /************************************************************************ 
                                  IDLE
  *************************************************************************/

  const isIdleInit = 1
  const isIdleWait = 2

  let idleState = {
    s: null,
    idleStartDate: null,
    clear: function () {
      this.s = isIdleInit
      this.idleStartDate = null
    }
  }

  function DoIdle () {
    switch (idleState.s) {
      case isIdleInit: {
        idleState.idleStartDate = Date().now
        idleState.s = isIdleWait
        setAgain()
        break
      }
      case isIdleWait: {
        let armToWave = ''
        let nextTimeout = CWaitIdleTimeout
        while (armToWave === '') {
          const r = Math.floor(Math.random() * 10)
          switch (r) {
            case 1:
              armToWave = 'left'
              break
            case 2:
              armToWave = 'right'
              break
            default:
              nextTimeout += CWaitIdleTimeout
          }
        }
        console.log(nowStr(), 'Swing arm', armToWave)
        // it simply sends a command to the server without a Promise
        bot.swingArm(armToWave)
        setTimer(CWaitIdleTimeout)
        break
      }
    }
  }

  /************************************************************************ 
                                  CARPETING
  *************************************************************************/

  const CMaxDistanceToPlaceCarpet = 5
  const CMinDistanceToPlaceCarpet = 2

  const csCarpetingInit = 1
  const csFindBlocksToCarpetInit = 2
  const csFindblocksToCarpetOperation = 3
  const csCarpetAt = 4
  const csMovingToCarpet = 5

  let carpetingState = {
    s: null,
    blockBeneathType: null,
    blockBeneathY: null,
    blocksToCarpet: null,
    maxDistance: null,
    carpetEquipped: null,
    blockToCarpetAt: null,
    clear: function () {
      this.s = csCarpetingInit
      this.blockBeneathType = null
      this.blockBeneathY = null
      this.blocksToCarpet = null
      this.maxDistance = null
      this.blockToCarpetAt = null
      this.carpetEquipped = false
    }
  }

  function DoCarpeting () {
    switch (carpetingState.s) {
      case csCarpetingInit: {
        const posPlayer = bot.entity.position
        const posBeneath = posPlayer.offset(0, -1, 0)
        const blockPlayer = bot.blockAt(posPlayer)
        const blockBeneath = bot.blockAt(posBeneath)
        if (blockPlayer.type !== air_id) {
          console.log(
            nowStr(),
            'The block on the player is not air',
            blockPlayer,
            blockBeneath
          )
          process.exit(1)
        }
        carpetingState.blockBeneathType = blockBeneath.type
        carpetingState.blockBeneathY = blockBeneath.position.y
        carpetingState.s = csFindBlocksToCarpetInit
        carpetingState.maxDistance = CMinDistanceToPlaceCarpet
        setAgain()
        break
      }
      case csFindBlocksToCarpetInit: {
        carpetingState.s = csFindblocksToCarpetOperation
        carpetingState.blocksToCarpet = []
        setAgain()
        break
      }
      case csFindblocksToCarpetOperation: {
        const entityPos = bot.entity.position
        let wasSearchForblocksToCarpetNow = false
        if (carpetingState.blocksToCarpet.length === 0) {
          console.log(
            nowStr(),
            'Finding blocks to carpet at distance',
            carpetingState.maxDistance
          )
          carpetingState.blocksToCarpet = bot.findBlocks({
            point: entityPos,
            matching: carpetingState.blockBeneathType,
            maxDistance: carpetingState.maxDistance,
            count: CFindBlocksToReturnCarpeting,
            useExtraInfo: block => {
              const blockPos = block.position
              const posAbove1 = blockPos.offset(0, 1, 0)
              const blockAbove1 = bot.blockAt(posAbove1)
              if (blockAbove1.type !== air_id) return false
              if (blockPos.y !== carpetingState.blockBeneathY) return false
              const distance = entityPos.distanceTo(posAbove1)
              return (
                distance >= CMinDistanceToPlaceCarpet &&
                distance <= carpetingState.maxDistance
              )
            }
          })
          wasSearchForblocksToCarpetNow = true
          console.log(
            nowStr(),
            'Found blocks to carpet:',
            carpetingState.blocksToCarpet.length
          )
        }
        if (carpetingState.blocksToCarpet.length === 0) {
          if (wasSearchForblocksToCarpetNow === true) {
            // nothing to Carpet, try to find entity items
            carpetingState.maxDistance++
            if (carpetingState.maxDistance < 60) {
              // keep current state, search again
            } else {
              console.log(nowStr(), 'Cannot find any more blocks to carpet')
              process.exit(1)
            }
          } else {
            // keep current state, search again
          }
          setAgain()
        } else {
          const firstBlockToCarpetPos = carpetingState.blocksToCarpet.shift()
          const blockToCarpet = bot.blockAt(firstBlockToCarpetPos)
          const CarpetPos = blockToCarpet.position
          const aboveCarpetPos = CarpetPos.offset(0, 1, 0)
          const distanceToCarpet = aboveCarpetPos.distanceTo(entityPos)
          if (distanceToCarpet > CMaxDistanceToPlaceCarpet) {
            carpetingState.s = csMovingToCarpet
            carpetingState.blocksToCarpet = []
            carpetingState.maxDistance = CMinDistanceToPlaceCarpet
            console.log(
              nowStr(),
              'Going to carpeting',
              distanceToCarpet,
              aboveCarpetPos
            )
            const goal = new GoalNear(
              aboveCarpetPos.x,
              aboveCarpetPos.y,
              aboveCarpetPos.z,
              CMinDistanceToPlaceCarpet + 1
            )
            bot.pathfinder
              .goto(goal)
              .then(() => {
                console.log(
                  nowStr(),
                  'Go to carpeting complete',
                  aboveCarpetPos
                )
                carpetingState.s = csFindBlocksToCarpetInit
                setAgain()
              })
              .catch(err => {
                console.log(nowStr(), 'Go to carpeting error', aboveCarpetPos)
                carpetingState.s = csFindBlocksToCarpetInit
                setAgain()
              })
          } else {
            if (carpetingState.carpetEquipped !== true) {
              console.log(nowStr(), 'Equipping carpet...')
              bot
                .equip(white_carpet_id, 'hand')
                .then(() => {
                  console.log(nowStr(), 'Carpet equipping complete')
                  carpetingState.carpetEquipped = true
                  carpetingState.blockToCarpetAt = blockToCarpet
                  carpetingState.s = csCarpetAt
                  setAgain()
                })
                .catch(err => {
                  console.log(nowStr(), 'Carpet equipping error', err)
                  carpetingState.blocksToCarpet = []
                  process.exit(1)
                })
            } else {
              carpetingState.blockToCarpetAt = blockToCarpet
              carpetingState.s = csCarpetAt
              setAgain()
            }
          }
        }
        break
      }
      case csCarpetAt: {
        console.log(
          nowStr(),
          'Carpeting at ',
          carpetingState.blockToCarpetAt.position
        )
        bot
          .placeBlock(carpetingState.blockToCarpetAt, faceVectorUp)
          .then(() => {
            console.log(
              nowStr(),
              'Carpeting complete',
              carpetingState.blockToCarpetAt.position
            )
            carpetingState.blockToCarpetAt = null
            carpetingState.s = csFindblocksToCarpetOperation
            setAgain()
          })
          .catch(err => {
            console.log(
              nowStr(),
              'Carpeting error',
              err,
              carpetingState.blockToCarpetAt.position
            )
            carpetingState.blocksToCarpet = []
            carpetingState.blockToCarpetAt = null
            carpetingState.carpetEquipped = false
            carpetingState.s = csFindblocksToCarpetOperation
            setAgain()
          })
        break
      }
      case csMovingToCarpet: {
        console.log(nowStr(), 'should never enter csMovingToHarvest')
        process.exit(1)
        break
      }
      default:
        console.log(nowStr(), 'Unknown carpeting state')
        process.exit(1)
    }
  }

  /************************************************************************ 
                                  FARMING
  *************************************************************************/

  const fsFarmingInit = 1
  const fsFindBlocksToHarvestInit = 2
  const fsFindBlocksToHarvestOperation = 3
  const fsMovingToHarvest = 4
  const fsWaitCropsInit = 5
  const fsWaitingForCrops = 6
  const fsFindBlocksToSowInit = 7
  const fsFindBlocksToSowOperation = 8
  const fsSowAt = 9
  const fsMovingToSow = 10
  const fsFindEntityItemsInit = 11
  const fsIncreaseMaxDistance = 12
  const fsHarvesting = 13
  const fsSowing = 14

  const CInitialFarmingDistance = 3 // General radius, should not be less than CMaxDistanceToPlaceSeed
  const CMinDistanceToPlaceSeed = 0
  const CMaxDistanceToPlaceSeed = 3
  const CMinFarmDistanceToHarvest = 0
  const CMaxFarmDistanceToHarvest = 2
  const CMinItemFarmDistanceToGo = 2 // go to a dropped item if distance is larger than that

  let farmingState = {
    s: null,
    blocksToHarvest: null,
    blocksHarvestedAfterMove: null,
    blocksSowAfterMove: null,
    blocksToSow: null,
    maxDistance: null,
    wheatSeedEquipped: null,
    blockToSowAt: null,
    clear: function () {
      this.s = fsFarmingInit
      this.blocksToHarvest = null
      this.blocksHarvestedAfterMove = null
      this.blocksSowAfterMove = null
      this.blocksToSow = null
      this.maxDistance = null
      this.wheatSeedEquipped = null
      this.blockToSowAt = null
    }
  }

  function xzToHash (v) {
    return v.x * 65536 + v.z
  }

  function DoFarming () {
    switch (farmingState.s) {
      case fsFarmingInit: {
        farmingState.s = fsFindBlocksToHarvestInit
        farmingState.wheatSeedEquipped = false
        farmingState.maxDistance = CInitialFarmingDistance
        console.log(nowStr(), 'Farming init')
        setAgain()
        break
      }
      case fsFindBlocksToHarvestInit: {
        farmingState.blocksToHarvest = []
        farmingState.blocksHarvestedAfterMove = null
        farmingState.blocksSowAfterMove = null
        farmingState.s = fsFindBlocksToHarvestOperation
        setAgain()
        break
      }
      case fsFindBlocksToHarvestOperation: {
        const entityPos = bot.entity.position
        let wasSearchForBlocksToHarvestNow = false
        if (farmingState.blocksToHarvest.length === 0) {
          console.log(
            nowStr(),
            'Finding blocks to harvest at distance',
            farmingState.maxDistance
          )
          farmingState.blocksToHarvest = bot.findBlocks({
            point: entityPos,
            matching: wheat_crop_id,
            maxDistance: farmingState.maxDistance,
            count: CFindBlocksToReturnFarmingToHarvest,
            useExtraInfo: block => {
              if (block.metadata !== CWheatGrownMetadata) return false
              const blockPos = block.position
              const distanceToHarvest = blockPos.distanceTo(entityPos)
              if (
                distanceToHarvest < CMinFarmDistanceToHarvest ||
                distanceToHarvest > farmingState.maxDistance
              )
                return false
              return true
            }
          })
          wasSearchForBlocksToHarvestNow = true
          console.log(
            nowStr(),
            'Blocks to harvest found:',
            farmingState.blocksToHarvest.length
          )
        }
        if (farmingState.blocksToHarvest.length === 0) {
          if (wasSearchForBlocksToHarvestNow === true) {
            // nothing to harvest, try to sow
            farmingState.s = fsFindBlocksToSowInit
          } else {
            // keep current state, search again
          }
          setAgain()
        } else {
          const firstBlockToHarvestPos = farmingState.blocksToHarvest.shift()
          const blockToHarvest = bot.blockAt(firstBlockToHarvestPos)
          const harvestPos = blockToHarvest.position
          const distanceToHarvest = harvestPos.distanceTo(entityPos)
          if (distanceToHarvest > CMaxFarmDistanceToHarvest) {
            farmingState.s = fsMovingToHarvest
            farmingState.blocksToHarvest = []
            farmingState.maxDistance = CInitialFarmingDistance
            console.log(
              nowStr(),
              'Going to harvesting',
              distanceToHarvest,
              harvestPos
            )
            const goal = new GoalNear(
              harvestPos.x,
              harvestPos.y,
              harvestPos.z,
              1
            )
            bot.pathfinder
              .goto(goal)
              .then(() => {
                console.log(nowStr(), 'Go to harvesting: complete', harvestPos)
                farmingState.blocksHarvestedAfterMove = null
                farmingState.blocksSowAfterMove = null
                farmingState.s = fsFindBlocksToHarvestInit
                setAgain()
              })
              .catch(err => {
                console.log(nowStr(), 'Go to harvesting: error', harvestPos)
                farmingState.s = fsWaitCropsInit
                setAgain()
              })
          } else {
            console.log(nowStr(), 'Harvesting...', harvestPos)
            farmingState.s = fsHarvesting
            bot
              .dig(blockToHarvest)
              .then(() => {
                console.log(nowStr(), 'Harvesting complete', harvestPos)
                if (farmingState.blocksHarvestedAfterMove === null)
                  farmingState.blocksHarvestedAfterMove = new Set()
                farmingState.blocksHarvestedAfterMove.add(xzToHash(harvestPos))
                farmingState.s = fsFindBlocksToHarvestOperation
                setAgain()
              })
              .catch(err => {
                console.log(nowStr(), 'Harvesting error', err, harvestPos)
                farmingState.blocksToHarvest = []
                farmingState.s = fsWaitCropsInit
                setAgain()
              })
          }
        }
        break
      }
      case fsMovingToHarvest: {
        console.log(nowStr(), 'should never enter fsMovingToHarvest')
        process.exit(1)
        break
      }
      case fsHarvesting: {
        console.log(nowStr(), 'should never enter fsHarvesting')
        process.exit(1)
        break
      }
      case fsSowing: {
        console.log(nowStr(), 'should never enter fsSowing')
        process.exit(1)
        break
      }
      case fsWaitCropsInit: {
        console.log(nowStr(), 'Waiting for crops to grow...')
        farmingState.s = fsWaitingForCrops
        setTimer(CWaitForCropsToGrowTimeout)
        break
      }
      case fsWaitingForCrops: {
        farmingState.s = fsFindBlocksToHarvestInit
        setAgain()
        break
      }
      case fsFindBlocksToSowInit: {
        farmingState.s = fsFindBlocksToSowOperation
        farmingState.blocksToSow = []
        setAgain()
        break
      }
      case fsFindBlocksToSowOperation: {
        const entityPos = bot.entity.position
        let wasSearchForBlocksToSowNow = false
        if (farmingState.blocksToSow.length === 0) {
          console.log(
            nowStr(),
            'Finding blocks to sow at distance',
            farmingState.maxDistance
          )
          farmingState.blocksToSow = bot.findBlocks({
            point: entityPos,
            matching: farmland_id,
            maxDistance: farmingState.maxDistance,
            count: CFindBlocksToReturnFarmingToSow,
            useExtraInfo: block => {
              const blockPos = block.position
              const posAbove1 = blockPos.offset(0, 1, 0)
              const blockAbove1 = bot.blockAt(posAbove1)
              if (blockAbove1.type !== air_id) return false
              const distanceToSow = entityPos.distanceTo(blockAbove1.position)
              if (
                distanceToSow < CMinDistanceToPlaceSeed ||
                distanceToSow > farmingState.maxDistance
              )
                return false
              const h = xzToHash(blockPos)
              if (farmingState.blocksHarvestedAfterMove !== null) {
                if (farmingState.blocksHarvestedAfterMove.has(h)) return false
              }
              if (farmingState.blocksSowAfterMove !== null) {
                if (farmingState.blocksSowAfterMove.has(h)) return false
              }
              return true
            }
          })
          wasSearchForBlocksToSowNow = true
          console.log(
            nowStr(),
            'Found blocks to sow:',
            farmingState.blocksToSow.length
          )
        }
        if (farmingState.blocksToSow.length === 0) {
          if (wasSearchForBlocksToSowNow === true) {
            // nothing to sow, try to find entity items
            farmingState.s = fsFindEntityItemsInit
          } else {
            // keep current state, search again
          }
          setAgain()
        } else {
          const firstBlockToSowPos = farmingState.blocksToSow.shift()
          const blockToSow = bot.blockAt(firstBlockToSowPos)
          const sowPos = blockToSow.position
          const aboveSowPos = sowPos.offset(0, 1, 0)
          const distanceToSow = aboveSowPos.distanceTo(entityPos)
          if (distanceToSow > CMaxDistanceToPlaceSeed) {
            farmingState.s = fsMovingToSow
            farmingState.blocksToSow = []
            farmingState.maxDistance = CInitialFarmingDistance
            console.log(nowStr(), 'Going to sowing', distanceToSow, aboveSowPos)
            const goal = new GoalNear(
              aboveSowPos.x,
              aboveSowPos.y,
              aboveSowPos.z,
              1
            )
            bot.pathfinder
              .goto(goal)
              .then(() => {
                farmingState.blocksHarvestedAfterMove = null
                farmingState.blocksSowAfterMove = null
                console.log(nowStr(), 'Go to sowing: complete', aboveSowPos)
                farmingState.s = fsFindBlocksToSowInit
                setAgain()
              })
              .catch(err => {
                console.log(nowStr(), 'Go to sowing: error', aboveSowPos)
                farmingState.s = fsWaitCropsInit
                setAgain()
              })
          } else {
            if (farmingState.wheatSeedEquipped !== true) {
              console.log(nowStr(), 'Equipping seed...')
              bot
                .equip(wheat_seed_id, 'hand')
                .then(() => {
                  console.log(nowStr(), 'Equipping complete')
                  farmingState.wheatSeedEquipped = true
                  farmingState.blockToSowAt = blockToSow
                  farmingState.s = fsSowAt
                  setAgain()
                })
                .catch(err => {
                  console.log(nowStr(), 'Equipping error', err)
                  farmingState.blocksToSow = []
                  farmingState.s = fsWaitCropsInit
                  setAgain()
                })
            } else {
              farmingState.blockToSowAt = blockToSow
              farmingState.s = fsSowAt
              setAgain()
            }
          }
        }
        break
      }
      case fsSowAt: {
        const sowPos = farmingState.blockToSowAt.position
        console.log(
          nowStr(),
          'Sowing at',
          sowPos,
          'entity at',
          bot.entity.position,
          'distance',
          sowPos.distanceTo(bot.entity.position)
        )
        farmingState.s = fsSowing
        bot
          ._genericPlace(farmingState.blockToSowAt, faceVectorUp, {
            swingArm: 'right' /*, forceLook: 'ignore' */
          })
          .then(() => {
            console.log(nowStr(), 'Sowing complete', sowPos)
            if (farmingState.blocksSowAfterMove === null)
              farmingState.blocksSowAfterMove = new Set()
            farmingState.blocksSowAfterMove.add(xzToHash(sowPos))
            farmingState.blockToSowAt = null
            farmingState.s = fsFindBlocksToSowOperation
            setAgain()
          })
          .catch(err => {
            console.log(nowStr(), 'Sowing error', err, sowPos)
            farmingState.blocksToSow = []
            farmingState.blockToSowAt = null
            farmingState.wheatSeedEquipped = false
            farmingState.s = fsFindBlocksToSowOperation
            setAgain()
          })
        break
      }
      case fsFindEntityItemsInit: {
        const e = bot.nearestEntity(entity => {
          if (entity.name !== 'item') return false
          if (entity.metadata === null) return false
          if (entity.metadata === undefined) return false
          const lastMetadata = entity.metadata[entity.metadata.length - 1]
          if (lastMetadata === null) return false
          if (lastMetadata === undefined) return false

          const itemId = lastMetadata.itemId

          if (!(itemId === wheat_seed_id || itemId === wheat_id)) return false
          const d = entity.position.distanceTo(bot.entity.position)
          if (d <= CMinItemFarmDistanceToGo) return false
          return true
        })
        if (e === null) {
          farmingState.s = fsIncreaseMaxDistance
          setAgain()
        } else {
          const distance = e.position.distanceTo(bot.entity.position)
          if (
            distance > CMinItemFarmDistanceToGo &&
            distance < farmingState.maxDistance * 4
          ) {
            console.log(
              nowStr(),
              'Going to item; distance=',
              distance,
              'position=',
              e.position
            )
            farmingState.maxDistance = CInitialFarmingDistance
            const goal = new GoalNear(
              e.position.x,
              e.position.y,
              e.position.z,
              1
            )
            bot.pathfinder
              .goto(goal)
              .then(() => {
                farmingState.blocksHarvestedAfterMove = null
                farmingState.blocksSowAfterMove = null
                console.log(nowStr(), 'Go to item complete', e.position)
                farmingState.s = fsFindBlocksToSowInit
                setAgain()
              })
              .catch(err => {
                console.log(nowStr(), 'Go to item error', e.position)
                farmingState.s = fsWaitCropsInit
                setAgain()
              })
          } else {
            farmingState.s = fsIncreaseMaxDistance
            setAgain()
          }
        }
        break
      }
      case fsIncreaseMaxDistance: {
        farmingState.maxDistance++
        if (farmingState.maxDistance > CMaxDistance) {
          farmingState.s = fsFarmingInit
        } else {
          if (farmingState.maxDistance > 10) farmingState.maxDistance += 4
          if (farmingState.maxDistance > 20) farmingState.maxDistance += 8
          console.log(
            nowStr(),
            'Farming MaxDistance set to',
            farmingState.maxDistance
          )
          farmingState.s = fsFindBlocksToHarvestInit
        }
        if (farmingState.maxDistance < 8) {
          setAgain()
        } else {
          setTimer(100)
        }
        break
      }
      default:
        console.log(nowStr(), 'Unknown farming state')
        process.exit(1)
    }
  }

  /************************************************************************ 
                                  BUILDING
  *************************************************************************/

  let buildingState = {
    clear: function () {}
  }

  function DoBuilding () {}

  function switchStateTo (ANewState) {
    clearStates()
    clearTimer()
    CurrentState = ANewState
    setAgain()
  }

  function bot_on_whisper (username, message, rawMessage) {
    if (username === bot.username) return
    switch (message) {
      case 'idle':
      case 'stop':
        if (CurrentState === CStateIdle) {
          const now = Date().now()
          const idleDuration = Math.round(now - idleStartDate)
          const stringToWhisper = `I am already idle for ${idleDuration} seconds`
          console.log(nowStr(), 'Whiper: ', username, stringToWhisper)
          bot.whisper(username, stringToWhisper)
        } else {
          bot.whisper(username, 'Will wait...')
          switchStateTo(CStateIdle)
        }
        break
      case 'farm':
        if (CurrentState === CStateFarming) {
          bot.whisper(username, 'I am already farming')
        } else {
          bot.whisper(username, 'Let us farm!')
          switchStateTo(CStateFarming)
        }
        break
      case 'build':
        if (CurrentState === CStateBuilding) {
          bot.whisper(username, 'I am already building')
        } else {
          bot.whisper(username, 'Let us build!')
          switchStateTo(CStateBuilding)
        }
        break
      case 'carpet':
        if (CurrentState === CStateCarpeting) {
          bot.whisper(username, 'I am already carpeting')
        } else {
          bot.whisper(username, 'Let us carpet!')
          switchStateTo(CStateCarpeting)
        }
        break

      default:
        bot.whisper(username, 'I do not understand')
    }
  }

  function loop () {
    switch (CurrentState) {
      case CStateIdle:
        DoIdle()
        break
      case CStateFarming:
        DoFarming()
        break
      case CStateBuilding:
        DoBuilding()
        break
      case CStateCarpeting:
        DoCarpeting()
        break
      default:
        console.log(nowStr(), 'Unknown state!!!')
        process.exit(1)
    }
  }
}

main()
