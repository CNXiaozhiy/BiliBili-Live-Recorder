import fs from "fs";
import path from "path";
import logger from "../../logger";

type ScanResult = { 
    unknownFiles: string[], 
    unrecoveredFiles: { 
        file: string, 
        recoveryFile: string 
    }[], 
    damagedFiles: string[],
    exceptionallyLeftFiles: string[]
}


export default class FileCleaner {
    recordFolder: string

    constructor(recordFolder: string) {
        this.recordFolder = recordFolder
    }

    clean(excludedFiles?: string[]) {
        return new Promise<{statisticalInformation: { unrecoveredFiles: number, damagedFiles: number, exceptionallyLeftFiles: number }, errors: Error[] }>((resolve, reject) => {
            this.scan().then(result => {
                let errors: Error[] = [];

                result.damagedFiles.forEach(file => {
                    if (excludedFiles?.includes(file)) return
                    try {
                        fs.unlinkSync(file)
                    } catch (e: any) {
                        errors.push(e)
                        logger.warn('文件清理失败', e)
                    }
                })
                result.exceptionallyLeftFiles.forEach(file => {
                    if (excludedFiles?.includes(file)) return
                    try {
                        fs.unlinkSync(file)
                    } catch (e: any) {
                        errors.push(e)
                        logger.warn('文件清理失败', e)
                    }
                })

                resolve({ statisticalInformation: { 
                    unrecoveredFiles: result.unrecoveredFiles.length, 
                    damagedFiles: result.damagedFiles.length,
                    exceptionallyLeftFiles: result.exceptionallyLeftFiles.length
                } , errors })
            })
        })
    }

    scan() {
        return new Promise<ScanResult>((resolve) => {
            let resp: ScanResult = {
                unknownFiles: [],
                unrecoveredFiles: [],
                damagedFiles: [],
                exceptionallyLeftFiles: []
            }

            fs.readdir(this.recordFolder, (err, files) => {
                if (err) {
                    console.error(err);
                    return;
                }
    
                for (const file of files) {
                    const filePath = path.join(this.recordFolder, file);
                    const stat = fs.statSync(filePath);
                    
                    if (stat.isDirectory()) {
                        if (file === 'recovery') continue;

                    } else if (stat.isFile()) {
                        if (path.extname(file) !== '.flv') {
                            resp.unknownFiles.push(filePath);
                            continue
                        }

                        if (!file.includes('merged')) {
                            // 损坏的文件
                            resp.damagedFiles.push(filePath);
                        } else {
                            // 判断是否为未恢复的文件
                            const recoveryFile = path.join(this.recordFolder, 'recovery', `${file}_recovery.json`);
                            if (fs.existsSync(recoveryFile)) {
                                resp.unrecoveredFiles.push({ file: filePath, recoveryFile });
                            } else {
                                resp.exceptionallyLeftFiles.push(filePath);
                            }
                        }
                    }
                }

                resolve(resp)
            })

            
        })
    }
}