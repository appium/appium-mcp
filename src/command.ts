import type {AndroidUiautomator2Driver} from 'appium-uiautomator2-driver';
import type {XCUITestDriver} from 'appium-xcuitest-driver';
import type { Client } from 'webdriver';
import { isAndroidUiautomator2DriverSession, isXCUITestDriverSession } from './session-store.js';



export async function execute(driver: Client | AndroidUiautomator2Driver | XCUITestDriver, cmd: string, params: any): Promise<any> {
    if (isAndroidUiautomator2DriverSession(driver)) {
        return await driver.execute(cmd, params);
    } else if (isXCUITestDriverSession(driver)) {
        return await driver.execute(cmd, params);
    } else {
        return await (driver as Client).executeScript(cmd, [
        params,
      ]);
    }
}
