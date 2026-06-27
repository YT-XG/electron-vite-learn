import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'
import { app } from 'electron'
import path from 'node:path'
import TestFrame from '../frame/TestFrame'

export default class AppUpdater {
  constructor(window: TestFrame) {
    if (is.dev) {
      Object.defineProperty(app, 'isPackaged', {
        get() {
          return true
        }
      })
    }
    autoUpdater.updateConfigPath = path.join(__dirname, '../../dev-app-update.yml')
    autoUpdater.on('checking-for-update', () => {
      console.log('检查是否有新版本')
      window.send('main-to-test-checking', {
        status: 'checking',
        msg: '检查是否有新版本'
      })
    })
    autoUpdater.on('update-available', (e) => {
      console.log('发现新版本')
      const newVersion = e.version
      window.send('main-to-test-available', {
        status: 'findNewVersion',
        version: newVersion,
        msg: '发现新版本'
      })
    })
    autoUpdater.on('update-not-available', () => {
      console.log('当前是最新版本')
      window.send('main-to-test-newVersion', { type: 'update', data: '当前是最新版本' })
    })
    autoUpdater.on('update-downloaded', () => {
      console.log('下载完成')
    })

    //开发环境 autoUpdater.checkForUpdates()
    //生产环境
    autoUpdater.checkForUpdatesAndNotify()
  }
}
