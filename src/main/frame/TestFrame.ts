import BaseFrame from './BaseFrame'

export default class TestFrame extends BaseFrame {
  protected options: Electron.BrowserWindowConstructorOptions = {
    width: 500,
    height: 200,
    webPreferences: {
      nodeIntegration: true
    }
  }
  protected routePath: string = '/test'
}
