const { app, BrowserWindow, Tray, Menu, globalShortcut, clipboard, ipcMain, nativeImage } = require('electron')
const Store = require('electron-store')
const path = require('path')

const store = new Store;

let mainWindow  // окно мешка
let tray        // иконка в трее
let floatWindow // плавающая иконка на экране



function createMainWindow(){
    mainWindow = new BrowserWindow({
        width: 340,
        height: 520,
        show: false,     
        frame: false,        
        transparent: true,
        alwaysOnTop: true,    // всегда поверх других окон
        skipTaskbar: true,    // не показывать в таскбаре внизу
        resizable: true,
        webPreferences: {
        nodeIntegration: true,      
        contextIsolation: false     
        }
    })
    mainWindow.loadFile('index.html')
    //mainWindow.webContents.openDevTools({ mode: 'detach' })
    
}

function createFloatWindow() {
    floatWindow = new BrowserWindow({
        width: 100,
        height: 100,
        show: false,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
        }
    })
    floatWindow.loadFile('float.html')
    //floatWindow.webContents.openDevTools({ mode: 'detach' })
}

function createTray() {
    const icon = nativeImage.createFromPath(path.join(__dirname, 'bagOfApples.png')) 
    tray = new Tray(icon)
    const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Появить мешок',
      click: () => {
        floatWindow.show()
      }
    },
    { type: 'separator' },
    {
      label: 'Убрать',
      click: () => app.quit()
    }
  ])

  tray.on('click', () => {
    if (floatWindow.isVisible()) {
      floatWindow.hide()
      if (mainWindow.isVisible()) mainWindow.hide()
    } else {
      floatWindow.show()
    }
  })

  // Правый клик — меню
  tray.on('right-click', () => {
    tray.popUpContextMenu()
  })

  tray.setToolTip('Мешок')
  tray.setContextMenu(contextMenu)
}


ipcMain.on('drag-start', () => {
  // ничего, просто ждём move
})

ipcMain.on('drag-move', (event, { deltaX, deltaY }) => {
  const [x, y] = floatWindow.getPosition()
  floatWindow.setPosition(x + deltaX, y + deltaY)
})


ipcMain.handle('get-data', () => {
  return store.get('bag', { tabs: [], items: [] })
})

ipcMain.on('save-data', (event, data) => {
  store.set('bag', data)
})


ipcMain.on('hide-float', () => {
  floatWindow.hide()
})

let toggleLocked = false
ipcMain.on('toggle-main', () => {
  if (toggleLocked) return
  toggleLocked = true
  setTimeout(() => { toggleLocked = false }, 300)

  if (mainWindow.isVisible()) {
    mainWindow.hide()
    floatWindow.setOpacity(0)
    floatWindow.show()
    setTimeout(() => {
      floatWindow.setOpacity(1)
    }, 50)
  } else {
    const floatBounds = floatWindow.getBounds()
    mainWindow.setPosition(floatBounds.x - 350, floatBounds.y)
    floatWindow.hide()
    mainWindow.setOpacity(0)
    mainWindow.show()
    setTimeout(() => {
      mainWindow.setOpacity(1)
      mainWindow.focus()
    }, 50)
  }
})



app.whenReady().then(() => {
  createMainWindow()
  createFloatWindow()
  createTray()
})

app.on('window-all-closed', (e) => { //зачем
  e.preventDefault()
})