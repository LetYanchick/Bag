const { ipcRenderer, clipboard, nativeImage } = require('electron')

let data = { tabs: [], items: [] }
// tabs — массив вкладок: [{ id, name }]
// items — массив элементов: [{ id, tabId, type, content}]

let activeTabId = null 

// Загружаем данные с диска при старте 
async function init() {
  data = await ipcRenderer.invoke('get-data')
  if (data.tabs.length > 0) {
    activeTabId = data.tabs[0].id
  }
  render()
}

//  Сохранение на диск 
function save() {
  ipcRenderer.send('save-data', data)
}

//  Генератор уникальных ID 
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

//  Ссылка или текст
function detectLink(text) {
  if (/^https?:\/\//i.test(text.trim())) 
    return 'link'
  return 'text'
}

//  Находим или создаём системную вкладку 
function getOrCreateTab(name) {
  let tab = data.tabs.find(t => t.name === name && t.system)
  if (!tab) {
    tab = { id: uid(), name, system: true }
    data.tabs.push(tab)
  }
  return tab
}

//  Добавляем элемент в мешок 
function addItem(type, content) {
  let tabId

  // Если вкладок нет вообще — автоматически определяем
  // Если есть активная пользовательская вкладка — кладём туда
  const activeTab = data.tabs.find(t => t.id === activeTabId)

  if (!activeTab || (activeTab && activeTab.system)) {
    // Автоматически в нужную системную вкладку
    const tabName = type === 'image' ? 'Картинки'
                  : type === 'link'  ? 'Ссылки'
                  : 'Записи'
    const tab = getOrCreateTab(tabName)
    tabId = tab.id
    activeTabId = tabId
  } else {
    // В активную вкладку
    tabId = activeTabId
  }

  const item = { id: uid(), tabId, type, content}
  data.items.unshift(item)
  save()
  render()
}

//  Ctrl+V в окне мешка 
document.addEventListener('paste', (e) => {
  // Сначала смотрим есть ли картинка
  console.log('paste items:', e.clipboardData.items.length)
  const items = e.clipboardData.items
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile()
      console.log('blob:', blob)
      if (!blob) continue
      const reader = new FileReader()
      reader.onload = () => {
        addItem('image', reader.result)
      }
      reader.readAsDataURL(blob)
      return
    }
  }

  // Текст
  const text = e.clipboardData.getData('text/plain')
  if (text) {
    const type = detectLink(text)
    addItem(type, text)
  }
})

//  Клик на элемент копирует
function copyItem(item) {
  if (item.type === 'image') {
    const img = nativeImage.createFromDataURL(item.content)
    clipboard.writeImage(img)
  } else {
    clipboard.writeText(item.content)
  }
  showToast()
}

//  Удалить элемент
function deleteItem(id) {
  data.items = data.items.filter(i => i.id !== id)

  // Если вкладка опустела — удаляем системную вкладку
  data.tabs = data.tabs.filter(tab => {
    if (!tab.system) return true
    return data.items.some(i => i.tabId === tab.id)
  })

  // Если активная вкладка удалилась — переключаемся
  if (!data.tabs.find(t => t.id === activeTabId)) {
    activeTabId = data.tabs[0]?.id || null
  }

  save()
  render()
}

// Создать новую вкладку
function createTab() {
  const input = document.getElementById('tabInput')
  const nameInput = document.getElementById('tabName')
  input.style.display = 'flex'
  nameInput.value = ''
  nameInput.focus()

  document.getElementById('tabConfirm').onclick = () => {
    const name = nameInput.value.trim()
    if (!name) return

    // Проверка на дубликат
    if (data.tabs.find(t => t.name === name)) {
      nameInput.style.borderColor = '#f38ba8'
      nameInput.placeholder = 'Такая вкладка уже есть!'
      nameInput.value = ''
      return
    }

    const tab = { id: uid(), name, system: false }
    data.tabs.push(tab)
    activeTabId = tab.id
    save()
    render()
    input.style.display = 'none'
    nameInput.style.borderColor = '#3d3d5c'
  }

  document.getElementById('tabCancel').onclick = () => {
    input.style.display = 'none'
    nameInput.style.borderColor = '#3d3d5c'
  }

  nameInput.onkeydown = (e) => {
    if (e.key === 'Enter') document.getElementById('tabConfirm').click()
    if (e.key === 'Escape') document.getElementById('tabCancel').click()
  }
}

//  Тост "Скопировано" 
function showToast() {
  const toast = document.getElementById('toast')
  toast.classList.add('show')
  setTimeout(() => toast.classList.remove('show'), 1800)
}

//  Рендер: рисуем вкладки и список
function render() {
  renderTabs()
  renderItems()
}

function renderTabs() {
  const container = document.getElementById('tabs')
  container.innerHTML = ''

  data.tabs.forEach(tab => {
    const btn = document.createElement('button')
    btn.className = 'tab' + (tab.id === activeTabId ? ' active' : '')
    btn.textContent = tab.name
    btn.onclick = () => {
      activeTabId = tab.id
      render()
    }
    btn.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      if (confirm(`Удалить вкладку "${tab.name}"?`)) {
        data.items = data.items.filter(i => i.tabId !== tab.id)
        data.tabs = data.tabs.filter(t => t.id !== tab.id)
        if (activeTabId === tab.id) {
          activeTabId = data.tabs[0]?.id || null
        }
        save()
        render()
      }
    })

    container.appendChild(btn)
  })

  // Кнопка [+] добавить вкладку
  const addBtn = document.createElement('button')
  addBtn.className = 'tab-add'
  addBtn.textContent = '+'
  addBtn.title = 'Новая вкладка'
  addBtn.onclick = createTab
  container.appendChild(addBtn)
}

function renderItems() {
  const container = document.getElementById('content')
  const tabItems = data.items.filter(i => i.tabId === activeTabId)

  if (!activeTabId || tabItems.length === 0) {
    container.innerHTML = `
      <div class="empty">
        Нажми Ctrl+V чтобы добавить<br>текст, ссылку или картинку
      </div>`
    return
  }

  container.innerHTML = ''
  tabItems.forEach(item => {
    const div = document.createElement('div')
    div.className = 'item' + (item.type === 'image' ? ' image-item' : '')

    if (item.type === 'image') {
      div.innerHTML = `
        <img class="item-img" src="${item.content}">
        <button class="delete-btn" data-id="${item.id}">×</button>`
    } else {
      div.innerHTML = `
        <span class="item-content">${item.content}</span>
        <button class="delete-btn" data-id="${item.id}">×</button>`
    }

    // Клик на элемент (не на крестик) — копировать
    div.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-btn')) 
        return
      copyItem(item)
    })

    container.appendChild(div)
  })

  // Вешаем удаление на крестики
  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.dataset.id))
  })
}



// Закрыть окно 
document.getElementById('closeBtn').addEventListener('click', () => {
  const { ipcRenderer } = require('electron')
  ipcRenderer.send('toggle-main')
})

//  Старт
init()