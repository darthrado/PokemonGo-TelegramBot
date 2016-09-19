/*Includes*/
var express = require('express');
var bodyParser = require("body-parser");
var fs = require('fs');
var telegram = require('telegram-bot-api');
var _ = require('underscore');
var sqlite3 = require('sqlite3').verbose(); //remember to remove verbose once on PROD

var app = express();

app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

var config = JSON.parse(fs.readFileSync('config.ini', 'utf8'));
assertParseConfig(config);

var gEnabledPokemon = config.enabledPokemon; //Enable pokemons up to a certain generation
var gDisabledPokemon =config.disabledPokemon; //Disable certain pokemon encounters to not be processed at all ever
var gTokenID = config.tokenID;
var gPortNum = config.portNum;
var gRootUserChatID = config.rootUserChatID;
var gDisableMessagingToNonRoot = config.disableMessagingToNonRoot;
var gDisableMessage = config.disableMessage
var gMapsUrl = config.mapsUrl;
var gDefaultLocation = config.defaultLocation;
var gDefaultLanguage = config.defaultLanguage;
var gEarthRadius = config.earthRadius; // km (change this constant to get miles)
var gRatio = config.ratio; //1km = 1000m (in case of miles change to get feet) 
var gUnitOfMeasurement = config.unitOfMeasurement; //Unit of measurement to display. Default m for meters

//Load localization
var localStrings=JSON.parse(fs.readFileSync('languages.json', 'utf8')); //parse localization json
assertParseLocal(localStrings);
var users = new Map(); // localStrings[users[user_id]].lParameter

//Parse PokemonJSON
var pokemon = JSON.parse(fs.readFileSync('pokemon.json', 'utf8'));


//Open DB. If needed tables don't exist - create and fill them
var dbOpen = false;
var db = new sqlite3.Database('maindb.db',function(err){

	db.serialize(function(){

		db.run("CREATE TABLE IF NOT EXISTS `users` ("+
			"'chat_id'	INTEGER UNIQUE,"+
			"'username'	TEXT,"+
			"'latitude'	REAL,"+
			"'longitude'	REAL,"+
			"'radius'	INTEGER,"+
			"'active'	INTEGER,"+
			"'ignore_flag'	INTEGER,"+
			"'venue_flag'	INTEGER,"+
			"'language'	TEXT,"+
			"PRIMARY KEY('chat_id'))"
		);

		db.run("CREATE TABLE IF NOT EXISTS 'pokemon_list' ("+
			"'id'	INTEGER PRIMARY KEY AUTOINCREMENT,"+
			"'name'	INTEGER)");
		
		db.run("CREATE TABLE IF NOT EXISTS 'pokemon' ("+
			"'poke_id'	INTEGER,"+
			"'latitude'	REAL,"+
			"'longitude'	REAL,"+
			"'disappear_time'	INTEGER,"+
			"PRIMARY KEY('poke_id','latitude','longitude','disappear_time'))"
		);
		
		db.run("CREATE TABLE IF NOT EXISTS 'pokemon_bak' ("+
			"'poke_id'	INTEGER,"+
			"'latitude'	REAL,"+
			"'longitude'	REAL,"+
			"'disappear_time'	INTEGER,"+
			"PRIMARY KEY('poke_id','latitude','longitude','disappear_time'))"
		);
		
		db.run("CREATE TABLE IF NOT EXISTS 'ignores' ("+
			"'chat_id'	INTEGER,"+
			"'ignored'	TEXT,"+
			"'ignored_id'	INTEGER,"+
			"PRIMARY KEY('chat_id','ignored','ignored_id'))"
		);
		
		db.run("CREATE TABLE IF NOT EXISTS 'backup_time' ("+
			"'last_maitanance'	INTEGER)");
		
		
		db.all("SELECT * FROM pokemon_list", [],function(err,rows){
			if(err){
			printObjectProperties(err);
			return;
			}
		
			if (rows.length === 0){
				db.serialize(function(){
					var insStatement = db.prepare("INSERT INTO pokemon_list (id,name) VALUES (?,?)");
					for (var i = 1; i <= gEnabledPokemon; i++) {
						insStatement.run(i,pokemon[i].name);
					}
					insStatement.finalize();
				});
			}
		});
		db.all("SELECT * FROM backup_time", [],function(err,rows){
			if(err){
				printObjectProperties(err);
				return;
			}
			var timestamp = ((new Date().getTime())/1000).toFixed(0);
			if (rows.length === 0){
				db.run("INSERT INTO backup_time(last_maitanance) VALUES (?)",[timestamp]);
			}
		});
		
		db.each("SELECT chat_id,language FROM users",function(err,row){
			if(err){
				return;
			}
			
			if(typeof row !== 'undefined'){
				users[row.chat_id]=row.language;
			}
		});
	
	});
	
	dbOpen = true;
});

//Init api and server
var api = new telegram({
    token: gTokenID ,
    updates: {
        enabled: true
    }
});
var server = require('http').Server(app);
var port = process.env.PORT ||  gPortNum;

//verifies that a the bot is connected to telegram
api.getMe().then(function(data) {
        console.log('telegram bot connected');
    })
    .catch(function(err) {
        console.log(err);
    });
	
//Custom assertion function	
function assert(condition, message) {
    if (!condition) {
        throw message || "Assertion failed";
    }
}

//Asserts the correct parsing of the config.ini file
function assertParseConfig(oConfig){
	var errorAsserting = "Error Asserting: ";

	assert(typeof oConfig === 'object',errorAsserting+"oConfig");
	
	assert(typeof oConfig.enabledPokemon === 'number' && isInt(oConfig.enabledPokemon),errorAsserting+"enabledPokemon");
	assert(typeof oConfig.disabledPokemon === 'object',errorAsserting+"disabledPokemon");
	
	oConfig.disabledPokemon.forEach(function(number){
		assert(typeof number === 'number' && isInt(number),errorAsserting+"disabledPokemon values");
	});

	assert(typeof oConfig.tokenID === 'string',errorAsserting+"tokenID");
	assert(typeof oConfig.portNum === 'number' && isInt(oConfig.portNum),errorAsserting+"portNum");
	assert(typeof oConfig.rootUserChatID === 'number' && isInt(oConfig.rootUserChatID),errorAsserting+"rootUserChatID");
	assert(typeof oConfig.disableMessagingToNonRoot === 'boolean',errorAsserting+"disableMessagingToNonRoot");
	assert(typeof oConfig.disableMessage === 'string',errorAsserting+"disableMessage");
	assert(typeof oConfig.mapsUrl === 'string',errorAsserting+"mapsUrl");
	assert(typeof oConfig.defaultLocation === 'object',errorAsserting+"defaultLocation");
	assert(typeof oConfig.defaultLocation.latitude === 'number',errorAsserting+"defaultLocation latitude");
	assert(typeof oConfig.defaultLocation.longitude === 'number',errorAsserting+"defaultLocation longitude");
	assert(typeof oConfig.defaultLocation.radius === 'number'&& isInt(oConfig.defaultLocation.radius),errorAsserting+"defaultLocation radius");
	assert(typeof oConfig.defaultLanguage === 'string',errorAsserting+"defaultLanguage");
	assert(typeof oConfig.earthRadius === 'number',errorAsserting+"earthRadius");
	assert(typeof oConfig.ratio === 'number',errorAsserting+"ratio");
	assert(typeof oConfig.unitOfMeasurement === 'string',errorAsserting+"unitOfMeasurement");
}

//Asserts the correct parsin of the languages.json
function assertParseLocal(oLocal){
	var errorAsserting = "Error Asserting: ";

	assert(typeof oLocal === 'object',errorAsserting+"oLocal");
	
	/*printObjectProperties(oLocal);*/
	for(var key in oLocal){
		assert(typeof oLocal[key].lLanguageNotAvail === 'string',errorAsserting+oLocal[key]+"[lLanguageNotAvail]");
		assert(typeof oLocal[key].lLanguage === 'string',errorAsserting+oLocal[key]+"[lLanguage]");
		assert(typeof oLocal[key].lMissingParameterAfter === 'string',errorAsserting+"[lMissingParameterAfter]");
		assert(typeof oLocal[key].lInvalidPokemonNum === 'string',errorAsserting+oLocal[key]+"[lInvalidPokemonNum]");
		assert(typeof oLocal[key].lDisappearsAt === 'string',errorAsserting+oLocal[key]+"[lDisappearsAt]");
		assert(typeof oLocal[key].lLocationRecorded === 'string',errorAsserting+oLocal[key]+"[lLocationRecorded]");
		assert(typeof oLocal[key].lNotificationsStart === 'string',errorAsserting+oLocal[key]+"[lNotificationsStart]");
		assert(typeof oLocal[key].lWellcome === 'string',errorAsserting+oLocal[key]+"[lWellcome]");
		assert(typeof oLocal[key].lDefaultCoordsSet === 'string',errorAsserting+oLocal[key]+"[lDefaultCoordsSet]");
		assert(typeof oLocal[key].lRadius === 'string',errorAsserting+oLocal[key]+"[lRadius]");
		assert(typeof oLocal[key].lCoordinates === 'string',errorAsserting+oLocal[key]+"[lCoordinates]");
		assert(typeof oLocal[key].lMapsLink === 'string',errorAsserting+oLocal[key]+"[lMapsLink]");
		assert(typeof oLocal[key].lForMoreInfo === 'string',errorAsserting+oLocal[key]+"[lForMoreInfo]");
		assert(typeof oLocal[key].lNotificationStrop === 'string',errorAsserting+oLocal[key]+"[lNotificationStrop]");
		assert(typeof oLocal[key].lIgnored === 'string',errorAsserting+oLocal[key]+"[lIgnored]");
		assert(typeof oLocal[key].lErrorIncorrectNameOrExists === 'string',errorAsserting+oLocal[key]+"[lErrorIncorrectNameOrExists]");
		assert(typeof oLocal[key].IUnignored === 'string',errorAsserting+oLocal[key]+"[IUnignored]");
		assert(typeof oLocal[key].lErrorIncorrectNameOrNotExists === 'string',errorAsserting+oLocal[key]+"[lErrorIncorrectNameOrNotExists]");
		assert(typeof oLocal[key].lListEmpty === 'string',errorAsserting+oLocal[key]+"[lListEmpty]");
		assert(typeof oLocal[key].lHelpIntro === 'string',errorAsserting+oLocal[key]+"[lHelpIntro]");
		assert(typeof oLocal[key].lHelpCommands === 'string',errorAsserting+oLocal[key]+"[lHelpCommands]");
		assert(typeof oLocal[key].lHelpStart === 'string',errorAsserting+oLocal[key]+"[lHelpStart]");
		assert(typeof oLocal[key].lHelpStop === 'string',errorAsserting+oLocal[key]+"[lHelpStop]");
		assert(typeof oLocal[key].lHelpMode === 'string',errorAsserting+oLocal[key]+"[lHelpMode]");
		assert(typeof oLocal[key].lHelpLanguage === 'string',errorAsserting+oLocal[key]+"[lHelpLanguage]");
		assert(typeof oLocal[key].lHelpInfo === 'string',errorAsserting+oLocal[key]+"[lHelpInfo]");
		assert(typeof oLocal[key].lHelpRadius === 'string',errorAsserting+oLocal[key]+"[lHelpRadius]");
		assert(typeof oLocal[key].lHelpLocation === 'string',errorAsserting+oLocal[key]+"[lHelpLocation]");
		assert(typeof oLocal[key].lHelpLocationTip === 'string',errorAsserting+oLocal[key]+"[lHelpLocationTip]");
		assert(typeof oLocal[key].lHelpIgnore === 'string',errorAsserting+oLocal[key]+"[lHelpIgnore]");
		assert(typeof oLocal[key].lHelpIgnoreEnable === 'string',errorAsserting+oLocal[key]+"[lHelpIgnoreEnable]");
		assert(typeof oLocal[key].lHelpUnignore === 'string',errorAsserting+oLocal[key]+"[lHelpUnignore]");
		assert(typeof oLocal[key].lHelpList === 'string',errorAsserting+oLocal[key]+"[lHelpList]");
		assert(typeof oLocal[key].lHelpLocate === 'string',errorAsserting+oLocal[key]+"[lHelpLocate]");
		assert(typeof oLocal[key].lHelpKnownBugs === 'string',errorAsserting+oLocal[key]+"[lHelpKnownBugs]");
		assert(typeof oLocal[key].lIncorrectValue === 'string',errorAsserting+oLocal[key]+"[lIncorrectValue]");
		assert(typeof oLocal[key].lRadCantBeNegative === 'string',errorAsserting+oLocal[key]+"[lRadCantBeNegative]");
		assert(typeof oLocal[key].lNewRadius === 'string',errorAsserting+oLocal[key]+"[lNewRadius]");
		assert(typeof oLocal[key].lKnownBug1 === 'string',errorAsserting+oLocal[key]+"[lKnownBug1]");
		assert(typeof oLocal[key].lUseOnyInReply === 'string',errorAsserting+oLocal[key]+"[lUseOnyInReply]");
		assert(typeof oLocal[key].lNoGmapsLink === 'string',errorAsserting+oLocal[key]+"[lNoGmapsLink]");
		assert(typeof oLocal[key].lON === 'string',errorAsserting+oLocal[key]+"[lON]");
		assert(typeof oLocal[key].lOFF === 'string',errorAsserting+oLocal[key]+"[lOFF]");
		assert(typeof oLocal[key].lMessages === 'string',errorAsserting+oLocal[key]+"[lMessages]");
		assert(typeof oLocal[key].lLocations === 'string',errorAsserting+oLocal[key]+"[lLocations]");
		assert(typeof oLocal[key].lUser === 'string',errorAsserting+oLocal[key]+"[lUser]");
		assert(typeof oLocal[key].lRadius === 'string',errorAsserting+oLocal[key]+"[lRadius]");
		assert(typeof oLocal[key].lNotifications === 'string',errorAsserting+oLocal[key]+"[lNotifications]");
		assert(typeof oLocal[key].lCoordinates === 'string',errorAsserting+oLocal[key]+"[lCoordinates]");
		assert(typeof oLocal[key].lNotifMode === 'string',errorAsserting+oLocal[key]+"[lNotifMode]");
		assert(typeof oLocal[key].lIgnoreList === 'string',errorAsserting+oLocal[key]+"[lIgnoreList]");
		assert(typeof oLocal[key].lModeSet === 'string',errorAsserting+oLocal[key]+"[lModeSet]");
		assert(typeof oLocal[key].lModeNoExist === 'string',errorAsserting+oLocal[key]+"[lModeNoExist]");
		assert(typeof oLocal[key].lLanguageWord === 'string',errorAsserting+oLocal[key]+"[lLanguageWord]");
		assert(typeof oLocal[key].lListIgnore === 'string',errorAsserting+oLocal[key]+"[lListIgnore]");
		assert(typeof oLocal[key].lListNotify === 'string',errorAsserting+oLocal[key]+"[lListNotify]");
	}

}


//For development purposes - disables the processing of all commands for all users except the root user
//This can be used when developing experimental functionality or when there is problem with the Pokemon Go api and you want to set a warning message that the API is not working, while not disabling the bot to yourself
function disableMessageProcessing(chatid){

	if(gDisableMessagingToNonRoot === true && chatid !== gRootUserChatID){
	
		console.log(chatid,gDisableMessage);
	
		if(gDisableMessage.length>0)
	
	    api.sendMessage({
            chat_id: chatid,
            text: gDisableMessage
        });
		
		return true;
	}
	
	return false;

}

//Takes the argument passed from '/ignore ignoreParam' and processes it appropriately
//If it's a valid pokemon number or name - return iStatus = OK and retunString - the name of the ignored pokemon
// if enable or disable string is passed - returns the appropriate iStatus
function processIgnoreParameter(chatid,ignoreParam){
		var toIgnoreString = ignoreParam;
		var toIgnoreUpper = toIgnoreString;
		var iStatus = 'OK';
		var strErrMessage = '';
		
		
		if(typeof ignoreParam === 'undefined' || ignoreParam == null || ignoreParam === ''){	
			iStatus='ERROR';
			strErrMessage= localStrings[users[chatid]].lMissingParameterAfter+" /ignore"
		}
		else{
		
			switch(toIgnoreUpper.toUpperCase()){
				case "ALL":
					break;
				case "ENABLE":
					iStatus = 'ENABLE';
					break;
				case "DISABLE":
					iStatus = 'DISABLE';
					break
				default:
					ignoreParam = parseFloat(ignoreParam);
		
					if(!_.isNaN(ignoreParam)){
						if(isInt(ignoreParam)&&ignoreParam>0&&ignoreParam<=gEnabledPokemon){
							toIgnoreString=pokemon[ignoreParam].name
						}
						else{
							iStatus='ERROR';
							strErrMessage = localStrings[users[chatid]].lInvalidPokemonNum+': '+ignoreParam;
						}
					}
			}	
		}
	
	var oResult = {status: iStatus , errorMessage: strErrMessage, returnString: toIgnoreString};
	return oResult;
}

//For testing purpouses, prints the contents of an object
function printObjectProperties(Object){

	if(typeof Object !== 'object')
	{
		console.log('Object is of type ',typeof Object);
	}
	else{
		for(var key in Object) {
		var value = Object[key];
			console.log(key,Object[key]);
		}
	}

}

//Calculates the distance between 2 coordinates
function getDistance(lat1, lon1, lat2, lon2) {

    var lat1p = parseFloat(lat1);
    var lon1p = parseFloat(lon1);
    var lat2p = parseFloat(lat2);
    var lon2p = parseFloat(lon2);

	if(lat1p===lat2p&&lon1p===lon2p)
	{
		return 0;
	}
	
    var R = gEarthRadius;
    var dLat = (lat2p-lat1p) * Math.PI / 180;
    var dLon = (lon2p-lon1p) * Math.PI / 180;
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180 ) * Math.cos(lat2 * Math.PI / 180 ) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    var d = R * c;

    return Math.round(d*gRatio);

    return Math.Abs (d);
}

//Prepares an Encounter object
//The encounter object contains a text value and a venue value to be used depending on user preferences
function prepareMessage(chatid,poke_id,latitude,longitude,disappearTime,nowTime){

		if(typeof poke_id ==='undefined'||typeof latitude ==='undefined'||typeof longitude ==='undefined'||typeof disappearTime ==='undefined'||typeof nowTime ==='undefined'){
			return;
		}
		
		var id = poke_id;
		var remainingtime = disappearTime - nowTime;
		
		if(remainingtime<0){
			return;
		}
		
		var disappearMinute = getMinutesFromTimestamp(disappearTime);
		var disappearMinuteText = 'X:'+ disappearMinute.string;
		
		var minutes = Math.floor(remainingtime / 60);
		var seconds = remainingtime - minutes * 60;
		var url=gMapsUrl+latitude+','+longitude;
		var venueReturn = {title: pokemon[id].name+'['+id+'] '+minutes+':'+seconds+' min left.',
							address: localStrings[users[chatid]].lDisappearsAt+' ['+disappearMinuteText+']'};
		var textReturn = venueReturn.title +'\n'+ venueReturn.address+ '\n ' + url;
		
		var toReturn = {text: textReturn, venue: venueReturn};
		
		return toReturn;
}

//gets minutes from UTC date rounded to seconds For example 1474205400 (1474205400000 in ms) = 30
function getMinutesFromTimestamp(timestamp){

	var florToHours = Math.floor(timestamp/3600);
	var backToSeconds = florToHours * 3600;
	var result = Math.floor((timestamp-backToSeconds)/60);

	if(result<10)
	{
		resultToString = '0'+result;
	}
	else
	{
	resultToString = result;
	}
	return {string: resultToString, number:result};
	
	
}

//Process a message sent by the user
api.on('message', function(message) {


	if(disableMessageProcessing(message.chat.id)===true || dbOpen===false){
		return;
	}

	//Process a location message - update latitute and longitude of the user and list all active pokemon in his radius
	if (message.location){
	    console.log(message.location.latitude,message.location.longitude, message.chat.username);
		db.run('UPDATE users SET latitude = ?, longitude = ? WHERE chat_id = ?',[message.location.latitude,message.location.longitude,message.chat.id]);
        api.sendMessage({
            chat_id: message.chat.id,
            text: localStrings[users[message.chat.id]].lLocationRecorded
        });
		
		console.log(message.location.latitude,message.location.longitude,message.chat.username);
		
		var timestamp = ((new Date().getTime())/1000).toFixed(0);
		var timestamp_15 = timestamp - 900;
		
		console.log(timestamp);
		
		var sqlSelectEncounteredPokemon = " SELECT pokemon.*,users.radius,users.venue_flag "+
											" FROM pokemon,users "+
											"WHERE disappear_time > ? "+
											"  AND users.chat_id = ? "+
											"  AND (ignore_flag = 0"+
											"	  OR NOT EXISTS (SELECT 1 "+
																"  FROM ignores "+
																" WHERE chat_id = users.chat_id "+
																"   AND ignored_id = pokemon.poke_id))";
		
		db.all(sqlSelectEncounteredPokemon, [timestamp_15,message.chat.id],function(err,rows){
		
			if(rows.length>0){
				rows.forEach(function (row) {  
					
					var messageBodyObject = prepareMessage(message.chat.id,row.poke_id,row.latitude,row.longitude,row.disappear_time,timestamp);
	
					dDistance = getDistance(message.location.latitude, message.location.longitude, row.latitude, row.longitude);
					
					console.log(dDistance,messageBodyObject,remainingtime);
					
					if (dDistance<row.radius && typeof messageBodyObject !== 'undefined'){
						console.log('Sent to', message.chat.id, message.location.latitude, message.location.longitude, row.radius);
						
						if(row.venue_flag){
							api.sendVenue({
								chat_id: message.chat.id,
								latitude: row.latitude,
								longitude: row.longitude,
								title: dDistance+gUnitOfMeasurement+' '+messageBodyObject.venue.title,
								address: messageBodyObject.venue.address
							});
						}
						else{
							var fullMessage = dDistance+gUnitOfMeasurement+' '+messageBodyObject.text+'\n';
						
							api.sendMessage({
								chat_id: message.chat.id,
								text: fullMessage
							});
						}
					}
				});
			}
		
		});
	}

	if(typeof message.text !== 'undefined' && message.text !== null){
	
	console.log(message.text, message.chat.username);
	
	//Start the notifications and register the new user if he doesn't already exist in the DB
    if (message.text == '/start') {
		
		db.run('INSERT INTO users (chat_id,username,latitude,longitude,radius,active,ignore_flag,venue_flag,language) VALUES (?,?,?,?,?,1,1,0,?)',[message.chat.id,message.chat.username,gDefaultLocation.latitude,gDefaultLocation.longitude,gDefaultLocation.radius,gDefaultLanguage],function(err){
			if(err){
				db.run('UPDATE users SET active = 1 WHERE chat_id = ?',[message.chat.id]);
				
				api.sendMessage({
					chat_id: message.chat.id,
					text: localStrings[users[message.chat.id]].lNotificationsStart
				});
			}
			else{
				users[message.chat.id]=gDefaultLanguage;
				api.sendMessage({
					chat_id: message.chat.id,
					text: localStrings[users[message.chat.id]].lWellcome+' '+message.chat.username+'\n'+
							localStrings[users[message.chat.id]].lDefaultCoordsSet+': \n'+
							localStrings[users[message.chat.id]].lRadius+': '+gDefaultLocation.radius+gUnitOfMeasurement+' \n'+localStrings[users[message.chat.id]].lCoordinates+': '+gDefaultLocation.latitude+' ,'+gDefaultLocation.longitude+' \n'+
							localStrings[users[message.chat.id]].lMapsLink+': '+gMapsUrl+gDefaultLocation.latitude+','+gDefaultLocation.longitude+' \n'+
							localStrings[users[message.chat.id]].lForMoreInfo+' /help'
				});
			}
		});
	
    } 
	//Stop the notifications for the current user
    if (message.text == '/stop') {
        api.sendMessage({
            chat_id: message.chat.id,
            text: localStrings[users[message.chat.id]].lNotificationStrop
        });
        db.run('UPDATE users SET active = 0 WHERE chat_id = ?',[message.chat.id]);
    }

	//Process an ignore command
    if (message.text.substring(0, 8) == '/ignore ') {		
		var toIgnore = message.text.substring(8);
		
		var ignoreResult = processIgnoreParameter(message.chat.id,toIgnore);
		
		if(ignoreResult.status==='ENABLE' || ignoreResult.status === 'DISABLE'){
			var ignoreFlag;
			if(ignoreResult.status==='ENABLE'){
				ignoreFlag = 1;
			}
			else{
				ignoreFlag = 0;
			}
			
			db.run("UPDATE users SET ignore_flag = ? WHERE chat_id = ?",[ignoreFlag,message.chat.id]);
			
			api.sendMessage({
				chat_id: message.chat.id,
				text: 'Ignores '+ignoreResult.status.toLowerCase()+'d'
			});
			
			return;
			
		}
		
		if(ignoreResult.status === 'ERROR' || typeof ignoreResult === 'undefined'){
			api.sendMessage({
				chat_id: message.chat.id,
				text: ignoreResult.errorMessage
			});
			return;
		}
		
		var sqlInsertIgnore = "INSERT INTO ignores (chat_id,ignored,ignored_id) "+
								"SELECT $chatid,name,id "+
								"  FROM pokemon_list "+
								" WHERE (UPPER(name) = UPPER($toIgnore) OR UPPER($toIgnore) = 'ALL') "+
								"   AND NOT EXISTS (SELECT 1 "+
													" FROM ignores "+
													"WHERE chat_id = $chatid "+
													"  AND UPPER(ignored) = UPPER(pokemon_list.name))";
		
		db.run(sqlInsertIgnore,{
			$chatid: message.chat.id, 
			$toIgnore: ignoreResult.returnString}, function(err){
			if(this.changes>0){
				api.sendMessage({
					chat_id: message.chat.id,
					text: localStrings[users[message.chat.id]].lIgnored+": "+ignoreResult.returnString
				});
			}
			else{
				api.sendMessage({
					chat_id: message.chat.id,
					text: localStrings[users[message.chat.id]].lErrorIncorrectNameOrExists
				});
			}
		});
		
    }
	//Process an unignore command
    if (message.text.substring(0, 10) == '/unignore ') {
		var toUnIgnore = message.text.substring(10);
		
		var unIgnoreResult = processIgnoreParameter(message.chat.id,toUnIgnore);
		
		if(unIgnoreResult.status === 'ERROR'){
			api.sendMessage({
				chat_id: message.chat.id,
				text: unIgnoreResult.errorMessage
			});
			return;
		}
		
		db.run("DELETE FROM ignores WHERE chat_id = ? and (UPPER(ignored) = UPPER(?) OR UPPER(?) = 'ALL')",[message.chat.id, unIgnoreResult.returnString,unIgnoreResult.returnString],function(err){
			if(this.changes>0){
				api.sendMessage({
					chat_id: message.chat.id,
					text: localStrings[users[message.chat.id]].IUnignored+": "+unIgnoreResult.returnString
				});
			}
			else{
				api.sendMessage({
					chat_id: message.chat.id,
					text: localStrings[users[message.chat.id]].lErrorIncorrectNameOrNotExists
				});
			}
		});
    }

	//List all ignored pokemon
    if (message.text.substring(0, 5) == '/list') {
		var listArgument = message.text.substring(6);
		
		db.all('SELECT ignored,ignored_id FROM ignores WHERE chat_id = ? ORDER BY ignored_id', [message.chat.id],function(err,rows){
			var ignoredMessage ='';
			var unIgnoredMessage = '';
			var finalMessage;
			
			if(rows.length>0){
				var allPokemon = [{name:'Empty',ignore: false}];
				for (var i=1; i<=gEnabledPokemon; i++){
					allPokemon.push({name: pokemon[i].name, ignore: false});
				}
				
				rows.forEach(function (row) { 
					allPokemon[row.ignored_id].ignore = true;
				});
				
				for(var i=1; i<=gEnabledPokemon; i++){
					if(allPokemon[i].ignore===true){
						ignoredMessage = ignoredMessage+i+':'+allPokemon[i].name+'\n';
					}
					else{
						unIgnoredMessage = unIgnoredMessage+i+':'+allPokemon[i].name+'\n';
					}
				}
				
				if(listArgument==='i'|| listArgument==='ignore'){
					finalMessage = ignoredMessage;
				}
				else if (listArgument==='n'||listArgument==='notify'){
					finalMessage = unIgnoredMessage;
				}
				else{
					finalMessage = localStrings[users[message.chat.id]].lListIgnore+": \n"+
									ignoredMessage+
									"==================\n"+
									localStrings[users[message.chat.id]].lListNotify+": \n"+
									unIgnoredMessage;
				}
				
				api.sendMessage({
					chat_id: message.chat.id,
					text: finalMessage
				});
			}
			else{
				api.sendMessage({
					chat_id: message.chat.id,
					text: localStrings[users[message.chat.id]].lListEmpty
				});
			}
		});
    }

	//Print help message
    if (message.text.substring(0, 5) == '/help') {
		var helptext = localStrings[users[message.chat.id]].lHelpIntro+' \n'+
						localStrings[users[message.chat.id]].lHelpCommands+': \n'+ 
						'/start - '+localStrings[users[message.chat.id]].lHelpStart+' \n'+ 
						'/stop - '+localStrings[users[message.chat.id]].lHelpStop+' \n'+
						'/info - '+localStrings[users[message.chat.id]].lHelpInfo+' \n'+
						'/setradius 1000 - '+localStrings[users[message.chat.id]].lHelpRadius+' \n'+
						'(phone location) - '+localStrings[users[message.chat.id]].lHelpLocation+' \n'+ 
						localStrings[users[message.chat.id]].lHelpLocationTip+' \n'+
						'/mode m |/mode l - '+localStrings[users[message.chat.id]].lHelpMode+' \n'+
						'/ignore Pidgey | /ignore 16 | /ignore all - '+localStrings[users[message.chat.id]].lHelpIgnore+' \n'+ 
						'/ignore enable | /ignore disable - '+localStrings[users[message.chat.id]].lHelpIgnoreEnable+' \n'+
						'/unignore Pidgey | /unignore 16 | /unignore all - '+localStrings[users[message.chat.id]].lHelpUnignore+' \n'+ 
						'/list - '+localStrings[users[message.chat.id]].lHelpList+' \n' +
						'/locate - '+localStrings[users[message.chat.id]].lHelpLocate+' \n'+
						'/lang EN - '+localStrings[users[message.chat.id]].lHelpLanguage+' \n'+
						'/knownbugs - '+localStrings[users[message.chat.id]].lHelpKnownBugs
		
        api.sendMessage({
            chat_id: message.chat.id,
            text: helptext
        });
    }
	
	//Sets the radius to an appropriate number
	if (message.text.substring(0, 10) == '/setradius'){
		
		var rad = parseFloat(message.text.substring(11));
		
		if(_.isNaN(rad)){
			
			api.sendMessage({
				chat_id: message.chat.id,
				text: localStrings[users[message.chat.id]].lIncorrectValue+': '+rad
			});
			

		}
		else{

			if(rad<=0){
				api.sendMessage({
					chat_id: message.chat.id,
					text: localStrings[users[message.chat.id]].lRadCantBeNegative
				});
				return;
			}
		
			db.run("UPDATE users SET radius = ? WHERE chat_id = ?",[rad,message.chat.id]);
			api.sendMessage({
				chat_id: message.chat.id,
				text: localStrings[users[message.chat.id]].lNewRadius+': ' + rad
			});
		
		}
	}

	//List of knownbugs bugs that the users can see. TO DO: Make it not hardcoded
	if (message.text.substring(0, 10) == '/knownbugs'){
		api.sendMessage({
            chat_id: message.chat.id,
            text: localStrings[users[message.chat.id]].lKnownBug1
        });
	}
	
	//Sends a TelegramAPI Location based on a Pokemon Encounter Message
	//User needs to reply to the Encounter with /locate for this to work
	if(message.text.substring(0, 7) === '/locate' ||message.text==='/l'){
		if(typeof message.reply_to_message === 'undefined'){
			api.sendMessage({
				chat_id: message.chat.id,
				text: localStrings[users[message.chat.id]].lUseOnyInReply
			});
			return;
		}
		
		if(typeof message.reply_to_message.text === 'undefined' || message.reply_to_message.text.indexOf(gMapsUrl)<0){
			api.sendMessage({
				chat_id: message.chat.id,
				text: localStrings[users[message.chat.id]].lNoGmapsLink
			});
			return;
		}
		
		var components = message.reply_to_message.text.split(' ');
		
		components.forEach(function (instance){
			if(instance.indexOf(gMapsUrl)>=0){
				var coordsString =instance.substring(gMapsUrl.length);
				var coords = coordsString.split(',');
				console.log(coords);

				api.sendLocation({
					chat_id: message.chat.id,
					latitude: coords[0],
					longitude: coords[1],
					reply_to_message_id: message.message_id
				});
			}
		});

	}
	
	//Lists the current settings of the user
	if (message.text.substring(0, 5) == '/info'){
		var onoff = [localStrings[users[message.chat.id]].lOFF,localStrings[users[message.chat.id]].lON]; // very basic solution.. think of an enum or something
		var mode = [localStrings[users[message.chat.id]].lMessages,localStrings[users[message.chat.id]].lLocations];
	
		db.get('SELECT * FROM users where chat_id = ?',[message.chat.id],function(err,row){
			var buildMessage = localStrings[users[message.chat.id]].lUser+': '+row.username+'\n'+
								localStrings[users[message.chat.id]].lLanguageWord+': '+localStrings[users[message.chat.id]].lLanguage+'\n'+
								localStrings[users[message.chat.id]].lRadius+': '+row.radius+gUnitOfMeasurement+' \n'+localStrings[users[message.chat.id]].lNotifMode+':['+mode[row.venue_flag]+'] \n'+
								localStrings[users[message.chat.id]].lNotifications+': ['+ onoff[row.active]+ '] \n'+localStrings[users[message.chat.id]].lIgnoreList+': ['+ onoff[row.ignore_flag]+ ']\n'+
								localStrings[users[message.chat.id]].lCoordinates+': ['+row.latitude+', '+row.longitude+'] \n'+
								localStrings[users[message.chat.id]].lMapsLink+': '+gMapsUrl+row.latitude+','+row.longitude;
		
			api.sendMessage({
				chat_id: message.chat.id,
				text: buildMessage
			});
		});
	}
	
	if (message.text.substring(0, 6) == '/mode '){
		var displayMode = message.text.substring(6);
		var venueFlagOpt = [localStrings[users[message.chat.id]].lMessages,localStrings[users[message.chat.id]].lLocations];
		var venueFlag;
		
		if(displayMode === 'm'||displayMode === 'msg'||displayMode === 'message'){
			venueFlag=0;
		}
		if(displayMode === 'l'||displayMode === 'location'){
			venueFlag=1;
		}
		
		if(typeof venueFlag !== 'undefined'){
		
			db.run("UPDATE users SET venue_flag = ? WHERE chat_id = ?",[venueFlag,message.chat.id]);
			
			api.sendMessage({
				chat_id: message.chat.id,
				text: localStrings[users[message.chat.id]].lModeSet+': '+venueFlagOpt[venueFlag]
			});
		
		}
		else{
			api.sendMessage({
				chat_id: message.chat.id,
				text: localStrings[users[message.chat.id]].lModeNoExist
			});
		}
		
		
	}
	if (message.text.substring(0, 6) == '/lang '){
		var displayLanguage = message.text.substring(6);
		
		if(typeof localStrings[displayLanguage] !== 'undefined'){
		
			db.run("UPDATE users SET language = ? WHERE chat_id = ?",[displayLanguage,message.chat.id]);
			users[message.chat.id]=displayLanguage;
		
			api.sendMessage({
				chat_id: message.chat.id,
				text: localStrings[users[message.chat.id]].lLanguage
			});
		}
		else{
			api.sendMessage({
				chat_id: message.chat.id,
				text: localStrings[users[message.chat.id]].lLanguageNotAvail
			});
		}
		
	}
	
	//RootUserOnly: sends a message to all other users. Good for broadcasting news and problems with the bot or map to all users
	if (message.text.substring(0, 12) == '/message_all'){
	
		if(message.chat.id !== gRootUserChatID){
			return;
		}
	
		var sendMessage = message.text.substring(12);
		console.log('Sending to all users:', sendMessage);
		
		db.each('select * from users',function(err,row){
			api.sendMessage({
				chat_id: row.chat_id,
				text: sendMessage
			});
		});
	}
	//RootUsersOnly: Remotely executes a select directly in the DB
	if(message.text.substring(0, 9) == '/exec_sql'){
	
		if(message.chat.id !== gRootUserChatID){
			console.log('Not Root');
			return;
		}
		
		var messageQuery = message.text.substring(9);
		
		db.run(messageQuery,[],function(err){
			var returnMessage;
			
			if(err){
				printObjectProperties(err);
				returnMessage = 'ERROR: '+err.errno+' '+err.code;
			}
			else{
				returnMessage = 'OK';
			 
			}
			
			api.sendMessage({
				chat_id: message.chat.id,
				text: returnMessage
			});
		
		});
	
	}
	
	}

});

function isInt(n) {
   return n % 1 === 0;
}

server.listen(port, function(err) {
    console.log('Running server on port ' + port);
});

app.post('/', function(req, res) {

	if (dbOpen === false){
		return;
	}

	if (req.body.type !== 'pokemon'){
	  return;
	}

	if (gDisabledPokemon.indexOf(req.body.message.pokemon_id)>=0){
		return;
	}
	
	//Inset Encounter in db
	db.run("INSERT INTO pokemon (poke_id,latitude,longitude,disappear_time) VALUES (?,?,?,?)",[req.body.message.pokemon_id,req.body.message.latitude,req.body.message.longitude,req.body.message.disappear_time],function(err){ 
		if(err){
			//If already there - return (weeds out duplicate encounters from the API)
			return;
		}
		else{
			var now= ((new Date().getTime())/1000).toFixed(0);
			
			//select all users that don't have this pokemon in their ignore list
			var DBSelectUsers = "SELECT * "+
								"  FROM users "+
								" WHERE (NOT EXISTS (SELECT 1 "+
												 	"  FROM ignores "+
													" WHERE chat_id = users.chat_id "+
													"   AND ignored_id = ?) "+
									"OR ignore_flag = 0) "+
									"AND active = 1";
			
			db.each(varDBSelectUsers,[req.body.message.pokemon_id], function(err, row) {
	
				var messageBodyObject = prepareMessage(row.chat_id,req.body.message.pokemon_id,req.body.message.latitude,req.body.message.longitude,req.body.message.disappear_time,now);
				
				dDistance = getDistance(req.body.message.latitude, req.body.message.longitude, row.latitude, row.longitude);
		
				//if pokemon is within distance and notifications are on - post
				if (dDistance<row.radius && typeof messageBodyObject !== 'undefined'){
					console.log('Sent to', row.chat_id, row.latitude, row.longitude, row.radius);
					
					if(row.venue_flag>0){
						api.sendVenue({
							chat_id: row.chat_id,
							latitude: req.body.message.latitude,
							longitude: req.body.message.longitude,
							title: dDistance+gUnitOfMeasurement+' '+messageBodyObject.venue.title,
							address: messageBodyObject.venue.address
						});
					}
					else{
						api.sendMessage({
							chat_id: row.chat_id,
							text: dDistance+gUnitOfMeasurement+' '+messageBodyObject.text
						});
					}
				}
			});
		}
	});
	
	//Check internal timer and clean DB from Encounters every hour
	//I should mayyyyyyybe run this within a callback function to ensure single run every hour
	db.get('SELECT last_maitanance FROM backup_time',function(err,row){
		var timestamp = ((new Date().getTime())/1000).toFixed(0);
		var diff = timestamp - row.last_maitanance;
		var time_passed = Math.floor(diff/ 60);
		
		if(time_passed>=60)
		{
			console.log('Performing regular DB cleanup every 60 min');
			db.run('INSERT INTO pokemon_bak SELECT * from pokemon WHERE disappear_time<= ?',[row.last_maitanance],function(err){
				if(err){
					return;
				}
				else{
					db.run('DELETE FROM pokemon WHERE disappear_time<= ?',[row.last_maitanance]);
					db.run('UPDATE backup_time SET last_maitanance = ?',[timestamp]);
				}
			});
		}
	
	});
		
	
});