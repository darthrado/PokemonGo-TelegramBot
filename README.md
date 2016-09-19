# PokemonGo-TelegramBot
A Telegram bot that works in paralel to an already set PokemonGo-Map. Reads the data from it and posts only what is relavant to the user.

The bot is designed to work best with an already set PokemonGo-Map for a large city (preferably with a spawnpoint search option)

The bot listens for encounters provided by the map and uses the principle of a Location (provided via telegram) and a radius to visualize only the pokemon relavant to the bot user.

(Credit where credit is due: https://github.com/danvoinea/PokeMapTelegram Used the following bot as a basis, but ended up completely redesigning it. My version is tuned to work for large cities with many encounters)

Setting up:

1. npm install

2. Create a telegram bot via BotFather and place it's Token key in the config.ini

3. Edit the config.ini to suit your needs

4. Edit languages.json should you need additional localization

5. run with "node pokemon" (Use "forever" (npm install forever -g) for permanent run)
