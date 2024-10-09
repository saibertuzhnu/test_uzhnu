'use strict';

var Logger = require('dw/system/Logger').getLogger('marketdirect');

const METHOD = 'PUT';
const FOLDER = 'pdf';
const FILE_TYPE = 'pdf';

/**
 * Call aws service
 * @param {Object} argsObj income object with arguments
 * @returns {string} pdf url or null
 */
function getService(argsObj) {
    var azureService = require('int_marketdirect/cartridge/scripts/services/AzureUploader')(true);
    var azureHelper = require('int_marketdirect/cartridge/scripts/helpers/azureHelper');
    var File = require('dw/io/File');
    var azureConfig = azureHelper.getS3Config();
    if (azureConfig) {
        let filePath = argsObj.path ? argsObj.path.join('/') : FOLDER + '/' + argsObj.orderNo;
        let fileType = argsObj.fileType ? argsObj.fileType : FILE_TYPE;
        let awsObject = azureConfig.azureStorageContainer + '/' + filePath + '/' + argsObj.barcode + '.' + fileType;
        let newUrl = azureConfig.azure_host + '/' + awsObject;
        azureService.setURL(newUrl);
        azureService.setRequestMethod(METHOD);
        let args = {
            'AWS_OBJECT': awsObject,
            'METHOD': METHOD,
            'CONTENT_TYPE': 'application/pdf'
        };
        let headers = azureHelper.getHeaders(azureConfig, args);
        azureService.addHeader('Access-Control-Request-Method', METHOD);
        azureService.addHeader('Authorization', headers.Authorization);
        azureService.addHeader('x-ms-date', headers.utcDate);
        azureService.addHeader('x-ms-version', headers.msVersion);
        let tempFileName = argsObj.sequence ? 'temp' + argsObj.sequence : 'temp';
        let serviceResponse = azureService.call({
            'file': new File(File.IMPEX + '/src/' + tempFileName + '.' + fileType)
        });
        if (serviceResponse.status !== 'OK') {
            Logger.debug('Content url {0}:\n{1}', newUrl, 'Please check Generate PDF MD service');
            return null;
        }
        if (argsObj.fileType === 'jpg') {
            newUrl = azureConfig.azure_host + '/' + azureConfig.azureStorageContainer
                + '/' + filePath + '/' + argsObj.barcode + '.' + fileType;
        }
        return newUrl;
    }
    Logger.error('Azure configuration for pdf generation is absent');
    return null;
}

module.exports.getService = getService;
