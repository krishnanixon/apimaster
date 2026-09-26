import { app } from 'electron'
import { join } from 'path'
import { USER_DATA_DIR } from '@shared/constants/product'

/** Single userData folder for dev, portable, and installed builds. */
export const USER_DATA_DIR_NAME = USER_DATA_DIR

app.setPath('userData', join(app.getPath('appData'), USER_DATA_DIR_NAME))
