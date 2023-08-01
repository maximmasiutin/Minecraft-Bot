# Minecraft Farming/Carpeting Bot 

Version 1.0

Copyright (C) 2023 Maxim Masiutin. All rights reserved.

This is a very simple bot that demonstrates the use of the mineflayer library.

## Watch Demos

 - Farming (plant/harvest wheat) on open terrain: https://youtu.be/RVaNNiG96-M
 - Farming with obstacle avoidance: https://youtu.be/8u5v3z2hx2k
 - Carpeting (fill surface with a white carpet): https://youtu.be/tKTukPgVf7Q

## Prerequisites

```
npm init
npm install --save mineflayer
npm install --save mineflayer-pathfinder
```

## Run The Bot

 - `node minecraft-bot.js <username> <server-version> <server-ip> <server-port>`

## Control The Bot

 - the bot is by default in idle mode; whisper a command to the bot; valid commands are:
   - idle (just wave hands occasionally)
   - stop (the same as idle, stop current activity)
   - farm (plant/harvest wheat)
   - carpet (fill surface with white carpets)
  
For example, if your bot has username "Glomik", use in Minecraft "/tell Glomik farm"

## License 

This program is distributed under the terms of GNU GPL v3.

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the  GNU General Public License for more details.
