'use strict';

const X_MS_VERSION = '2020-02-10';
const X_MS_BLOB_TYPE = 'BlockBlob';
const X_MS_SAS_SS = 'b';
const X_MS_SAS_SP = 'w';
const X_MS_SAS_SRT = 'o';
const X_MS_SAS_SPR = 'https';
const X_MS_SAS_SR = 'b';

/**
 * Check do we need to use Azure instead of S3 from site preferences
 * @returns {boolean} Check Azure is Enabled
 */
function checkIsEnabled() {
    var sitePrefs = require('sitepreferences');
    var azureIsEnabled = sitePrefs.getValue('azure_storage_enabled');

    return azureIsEnabled === true;
}

/**
 * Gets azure configuration from site preferences
 * @returns {Object} Azure configuration or null
 */
function getAzureConfig() {
    var sitePrefs = require('sitepreferences');
    const StringUtils = require('dw/util/StringUtils');
    var azureIsEnabled = checkIsEnabled();
    var configs = {
        'azureStorageAccount': azureIsEnabled ? sitePrefs.getValue('azure_storage_account') : '',
        'azureStorageKey': azureIsEnabled ? sitePrefs.getValue('azure_storage_key') : '',
        'azureStorageContainer': azureIsEnabled ? sitePrefs.getValue('azure_storage_container') : '',
        'azureCalendarContainer': azureIsEnabled ? sitePrefs.getValue('azure_storage_container_calendar') : '',
        'azureStorageSASToken': azureIsEnabled ? sitePrefs.getValue('azure_storage_sas_token') : '',
        'azureHost': azureIsEnabled ? sitePrefs.getValue('azure_host') : ''
    };

    var emptyFields = Object.keys(configs).filter(function(config) {
        return !configs[config];
    });

    // ip whitelist is optional and used only for SAS token generation from code
    configs.azureIPWhitelist = azureIsEnabled ? sitePrefs.getValue('azure_ip_whitelist') : '';

    // if at least one config empty do not initialize S3 uploader
    if (emptyFields.length) {
        return null;
    }

    configs.sasHash = StringUtils.encodeBase64(configs.azureStorageSASToken);

    return configs;
}

/**
 * Creates Authorization headers
 * @param {Object} azureConfig - object with Azure configuration
 * @param {Object} args - Input arguments
 * @returns {Object} headers
 */
function getHeaders(azureConfig, args) {
    const Encoding = require('dw/crypto/Encoding');
    const Mac = require('dw/crypto/Mac');
    const StringUtils = require('dw/util/StringUtils');
    var utcDate = new Date().toUTCString();
    var mac = new Mac(Mac.HMAC_SHA_256);

    var isPutRequest = args.METHOD.equalsIgnoreCase('PUT');

    var canonicalObjectPath = '/' + azureConfig.azureStorageAccount + '/' + args.AWS_OBJECT;

    var blobSize = (args.BLOB_SIZE ? args.BLOB_SIZE : 0);
    var contentType = (args.CONTENT_TYPE ? args.CONTENT_TYPE : 'image/png');

    var canonicalRequest = [
        args.METHOD,
        '', // "content-encoding"
        '', // "content-language"
        isPutRequest ? blobSize : '', // "content-length"
        '', // "content-md5"
        isPutRequest ? contentType : '', // "content-type"
        '', // "if-modified-since"
        '', // "if-match"
        '', // "if-none-match"
        '', // "if-unmodified-since"
        '', // "range"
        '',
        'x-ms-date:' + utcDate,
        'x-ms-version:' + X_MS_VERSION,
        canonicalObjectPath
    ];

    if (isPutRequest) {
        canonicalRequest.splice(12, 0, 'x-ms-blob-type:' + X_MS_BLOB_TYPE);
    }

    var stringToSign = canonicalRequest.map(function (el) {
        return (StringUtils.trim(el));
    }).join('\n');

    var signatureBytes = mac.digest(stringToSign, Encoding.fromBase64(azureConfig.azureStorageKey));
    var signatureEncoded = Encoding.toBase64(signatureBytes);

    var authHeader = 'SharedKey ' + azureConfig.azureStorageAccount + ':' + signatureEncoded;

    return {
        'Authorization': authHeader,
        'utcDate': utcDate,
        'msVersion': X_MS_VERSION,
        'msBlobType': X_MS_BLOB_TYPE,
        'contentType': contentType,
        'contentLength': blobSize
    };
}

/**
 * Creates SAS hash headers
 * @param {Object} azureConfig - object with Azure configuration
 * @param {Object} args - Input arguments
 * @returns {Object} headers
 */
function getSAStoken(azureConfig, args) {
    const Calendar = require('dw/util/Calendar');
    const Encoding = require('dw/crypto/Encoding');
    const Mac = require('dw/crypto/Mac');
    const StringUtils = require('dw/util/StringUtils');

    var mac = new Mac(Mac.HMAC_SHA_256);
    var calendarStart = new Calendar();
    var calendarEnd = new Calendar();
    let timeZoneToSet = dw.system.Site.getCurrent().getTimezone();
    calendarStart.setTimeZone(timeZoneToSet);
    calendarEnd.setTimeZone(timeZoneToSet);

    calendarEnd.add(Calendar.HOUR, 1); // timezone!!!!
    var dateStart = StringUtils.formatCalendar(calendarStart, 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
    var dateEnd = StringUtils.formatCalendar(calendarEnd, 'yyyy-MM-dd\'T\'HH:mm:ss\'Z\'');
    var canonicalizedResource = '/blob/' + azureConfig.azureStorageAccount + '/' + azureConfig.azureStorageContainer;

    //  **Containers**
    //  For version 2015-02-21 and later:
    //  ```
    //  URL = https://myaccount.blob.core.windows.net/music
    //  canonicalizedResource = "/blob/myaccount/music"
    //  ```

    var specificUri = '';

    if (args.fileName !== '') {
        specificUri = '/' + args.fileName;
    }

    // https://docs.microsoft.com/en-us/rest/api/storageservices/create-service-sas#constructing-the-signature-string
    // TODO: try to generate sas for container
    // also keep in mind that
    // ======================
    // To construct the signature string of a shared access signature,
    // first construct the string-to-sign from the fields comprising the request,
    // then encode the string as UTF-8 and compute the signature using the HMAC-SHA256 algorithm.
    // !!!!! Note that fields included in the string-to-sign must be URL-decoded.
    // ======================

    var specificUriRequest = [
        X_MS_SAS_SP, // signedPermissions
        dateStart, // signedStart
        dateEnd, // signedExpiry
        canonicalizedResource + specificUri, // canonicalizedResource
        '', // signedIdentifier
        '', // signedIP
        X_MS_SAS_SPR, // signedProtocol
        X_MS_VERSION, // signedVersion
        X_MS_SAS_SR, // signedResource
        '', // signedSnapshotTime
        '', // rscc
        '', // rscd
        '', // rsce
        '', // rscl
        '' // rsct
    ];

    var stringToSignUri = specificUriRequest.map(function (el) {
        return (StringUtils.trim(el));
    }).join('\n');

    var signatureBytesUri = mac.digest(stringToSignUri, Encoding.fromBase64(azureConfig.azureStorageKey));
    var signatureEncodedUri = Encoding.toBase64(signatureBytesUri);

    var sasTokenUri = '?sv=' + X_MS_VERSION
        + '&sr=' + X_MS_SAS_SR
        + '&srt=' + X_MS_SAS_SRT
        + '&sp=' + X_MS_SAS_SP
        + '&se=' + dateEnd
        + '&st=' + dateStart
        + '&spr=' + X_MS_SAS_SPR
        + '&sig=' + encodeURIComponent(signatureEncodedUri);

    // https://docs.microsoft.com/en-us/rest/api/storageservices/create-account-sas#constructing-the-signature-string

    // https://docs.microsoft.com/en-us/rest/api/storageservices/service-sas-examples

    var serviceOptionsRequest = [
        azureConfig.azureStorageAccount, // accountname
        X_MS_SAS_SP, // signedpermissions
        X_MS_SAS_SS, // signedservice
        X_MS_SAS_SRT, // signedresourcetype
        dateStart, // signedstart
        dateEnd, // signedexpiry
        '', // signedIP
        X_MS_SAS_SPR, // signedProtocol
        X_MS_VERSION // signedversion
    ];

    var stringToSignSvcOpts = serviceOptionsRequest.map(function (el) {
        return (StringUtils.trim(el));
    }).join('\n');

    var signatureBytesSvcOpts = mac.digest(stringToSignSvcOpts, Encoding.fromBase64(azureConfig.azureStorageKey));
    var signatureEncodedSvcOpts = Encoding.toBase64(signatureBytesSvcOpts);

    var sasTokenSvcOpts = '?sv=' + X_MS_VERSION
        + '&ss=' + X_MS_SAS_SS // b
        + '&srt=' + X_MS_SAS_SRT // o
        + '&sp=' + X_MS_SAS_SP // crwd
        + '&se=' + dateEnd
        + '&st=' + dateStart
        + '&spr=' + X_MS_SAS_SPR // https
        + '&sig=' + encodeURIComponent(signatureEncodedSvcOpts);

    var si = 'access'; // StringUtils.encodeBase64('access');

    var accountRequest = [
        X_MS_SAS_SP, // signedpermissions
        dateStart, // signedstart
        dateEnd, // signedexpiry
        canonicalizedResource, // resource blob/container
        si, // signedidentifier
        X_MS_VERSION // signedversion
    ];

    var stringToSignAcc = accountRequest.map(function (el) {
        return (StringUtils.trim(el));
    }).join('\n');

    var signatureBytesAcc = mac.digest(stringToSignAcc, Encoding.fromBase64(azureConfig.azureStorageKey));
    var signatureEncodedAcc = Encoding.toBase64(signatureBytesAcc);

    var sasTokenAcc = '?sv=' + X_MS_VERSION
        + '&sr=' + X_MS_SAS_SR
        + '&sp=' + X_MS_SAS_SP
        + '&se=' + dateEnd
        + '&st=' + dateStart
        + '&si=' + si
        + '&sig=' + encodeURIComponent(signatureEncodedAcc);

    return {
        'account': sasTokenAcc,
        'uri': sasTokenUri,
        'serviceOptions': sasTokenSvcOpts
    };
}

module.exports = {
    'checkIsEnabled': checkIsEnabled,
    'getAzureConfig': getAzureConfig,
    'getHeaders': getHeaders,
    'getSASToken': getSAStoken
};
