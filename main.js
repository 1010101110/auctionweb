// Modules to control application life and create native browser window
const {app, Tray, Menu, dialog, BrowserWindow} = require('electron')
const path = require('path')
const fs = require('fs')
const axios = require('axios')
const Store = require('electron-store');
const store = new Store();


let tray, win, watcher, watchertimeout

app.on('ready', async function(){
  //make sure electron default window doesn't pop up, we have to create hidden window
  //we never use this, just a blank window
  win = new BrowserWindow({ show: false });
  //the actual gui of our application
  tray = new Tray(path.join(__dirname,'icon.png'))
  tray.setToolTip('Auctionweb')

  //create the context menu for tray
  initMenu()

  //start the file watcher
  initWatcher()
})

function initMenu(){
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Filepath', click: getPath},
    { label: 'Startup: ' + app.getLoginItemSettings().openAtLogin, click:toggleStartup },
    { label: 'Upload count: ' + store.get('pushcount',0)},
    { label: 'Exit', click: exit },
  ])
  tray.setContextMenu(contextMenu)
}

function getPath(){
  let dialogresult = dialog.showOpenDialogSync({
    defaultPath:'C:\\Program Files (x86)\\World of Warcraft\\_classic_\\WTF',
    title:'select your World of Warcraft\\_classic_\\WTF folder',
    properties:['openDirectory']
  })

  if(dialogresult){
    store.set('luapath', dialogresult[0])
    initWatcher()
  }
}

function toggleStartup(){
  app.setLoginItemSettings({openAtLogin:!app.getLoginItemSettings().openAtLogin})
  initMenu()
}

function push(f){
  let datafile = fs.readFileSync(f)
  let datastring = datafile.toString()
  let findme = 'AUCTIONATOR_SNAPSHOT = '
  let isValid = datastring.indexOf(findme)

  if(isValid == -1){
    return
  }else{
    console.log('found file for upload ' + f)
    let snapshot = datastring.substring(isValid+findme.length)

    //transform the lua syntax into json
    //get rid of brackets around variables
    let trythis = snapshot.replace(/]/g,'')
    trythis = trythis.replace(/\[/g,'')
    //change variable values = to :
    trythis = trythis.replace(/=/g,':')
    //remove lua insert comments
    trythis = trythis.replace(/(-- [0-9]+)/g,'')
    //change auctions table {} to array []
    //start brace
    let startbrace = trythis.indexOf( '{', trythis.indexOf('"auctions" : '))
    trythis = trythis.substr(0,startbrace) + '[' + trythis.substr(startbrace+1)
    //end brace
    trythis = trythis.replace(/}\,[\s]+}\,/g,'}\r\n\t],')
    //remove trailing ,
    trythis = trythis.replace(/\,(?!\s*?[\{\[\"\'\w])/g,'')


    //if you want to save to file
    fs.writeFile('upload.json',trythis,function(err){
      console.log('saved auction file')
    })

    //now upload to server
    axios.post('https://auctionweb.app/api/upload',JSON.parse(trythis))
    .catch((error) => {
      console.error(error.response ? error.response.data : error.message)
    })
    .finally(()=>{
      store.set('pushcount',store.get('pushcount',0) + 1)
      initMenu()
    })
  }
}

function initWatcher(){
  if(watcher){
    watcher.close()
  }

  const luapath = store.get('luapath',null)

  if(!luapath){
    getPath()
  }else{
    watcher = fs.watch(luapath,{recursive:true},(e,f)=>{
      if(f && f.indexOf('Auctionator') !== -1 && f.indexOf('tmp') === -1 && f.indexOf('bak') === -1){
        //ensure we only process files one at a time
        if(!watchertimeout){
          watchertimeout = setTimeout(function() { watchertimeout=null }, 2000)
          //ensure we wait for the file save to actually complete
          //some OS will actually save file multiple times(in chunks) every save!
          //it is ok if we are 1 second slower it doesn't really matter in our use case
          setTimeout(function(){push(luapath +  '\\' + f)},1000);
        }
      }
    })
  }
}

function exit(){
  app.quit();
}