import child_process = require('child_process');
import fs = require('fs');
import { Uri } from "vscode";
import * as vscode from 'vscode';
import { getApi, FileDownloader } from "@microsoft/vscode-file-downloader-api";

const SUPPORTED_FILE_FORMATS: string[] = ['hlsl', 'fx', 'fxh', 'glsl'];
const SHADER_FORMATTER_LATEST_RELEASE_URL: string = 'https://github.com/Flone-dnb/shader-formatter/releases/latest/'
const SHADER_FORMATTER_BINARY_NAME: string = 'shader-formatter'
const BINARY_VERSION_KEYWORD: string = '-version-'

export async function activate(context: vscode.ExtensionContext) {
	let downloadBinary = false;

	// Get latest release version.
	let response = await fetch(SHADER_FORMATTER_LATEST_RELEASE_URL)
		.then(response => {
			return response.url;
		})
	let latestVersion = response.split('/').pop()
	if (latestVersion?.charAt(0) == 'v') {
		latestVersion = latestVersion.substring(1)
	}

	// View downloaded version.
	const fileDownloader: FileDownloader = await getApi();
	const downloadedFiles: Uri[] = await fileDownloader.listDownloadedItems(context);
	if (downloadedFiles.length == 0) {
		downloadBinary = true
	} else {
		let currentVersion = downloadedFiles[0].fsPath.split(BINARY_VERSION_KEYWORD).pop();

		if (currentVersion != latestVersion) {
			vscode.window.showInformationMessage("Found shader formatter update from "
				+ currentVersion + " to " + latestVersion);
			downloadBinary = true
		} else {
			// Check if we need to show message.
			let config = vscode.workspace.getConfiguration(SHADER_FORMATTER_BINARY_NAME);
			let showMessage = config.get<string>('showLatestVersionMessage');

			if (showMessage) {
				// Show latest version message.
				vscode.window.showInformationMessage("You are using the latest shader-formatter v"
					+ latestVersion + " - no updates found.");
			}
		}
	}

	if (downloadBinary) {
		// Delete all previously downloaded versions.
		await fileDownloader.deleteAllItems(context);

		// Prepare download URL.
		let download_url = SHADER_FORMATTER_LATEST_RELEASE_URL + "download/" + SHADER_FORMATTER_BINARY_NAME
		if (process.platform === "win32") {
			download_url += '.exe'
		}

		// Download file.
		vscode.window.showInformationMessage("Downloading shader-formatter v" + latestVersion + "...")
		const file: Uri = await fileDownloader.downloadFile(
			Uri.parse(download_url),
			SHADER_FORMATTER_BINARY_NAME + BINARY_VERSION_KEYWORD + latestVersion,
			context,
		);

		if (process.platform != "win32") {
			// Make file writeable.
			const downloadedFiles: Uri[] = await fileDownloader.listDownloadedItems(context)
			let pathToDownloadedBinary = downloadedFiles[0].fsPath
			fs.chmod(pathToDownloadedBinary, 0o775, (err) => {
				if (err) {
					vscode.window.showErrorMessage("failed to add 'execute' permission to file " + pathToDownloadedBinary)
				}
			});
		}

		vscode.window.showInformationMessage("shader-formatter v" + latestVersion + " is downloaded")
	}

	// Register "on save" callback.
	vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
		// Check if this language is supported.
		let supportedLanguage = false;
		for (var lang of SUPPORTED_FILE_FORMATS) {
			if (document.languageId == lang) {
				supportedLanguage = true;
				break;
			}
		}
		if (!supportedLanguage) {
			// Check the file name extension because non-standard HLSL/GLSL
			// may be interpreted as "plaintext" in `languageId`.
			for (var lang of SUPPORTED_FILE_FORMATS) {
				if (document.fileName.endsWith(lang)) {
					supportedLanguage = true;
					break;
				}
			}
		}
		if (!supportedLanguage) {
			return
		}

		// Get path to file.
		if (document.isUntitled) {
			return
		}
		let pathToShaderFile = document.uri.fsPath;
		if (!pathToShaderFile) {
			return
		}

		// Get config.
		let config = vscode.workspace.getConfiguration(SHADER_FORMATTER_BINARY_NAME);
		let binaryPath = config.get<string>('executable');

		if (!binaryPath || binaryPath.length == 0) {
			// Find downloaded binary.
			const downloadedFiles: Uri[] = await fileDownloader.listDownloadedItems(context);
			if (downloadedFiles.length == 0) {
				vscode.window.showErrorMessage('shader-formatter binary is not downloaded and \
					path to binary is not set in extension settings');
				return
			}

			binaryPath = downloadedFiles[0].fsPath;
		}

		// Run shader formatter.
		let stdout = '';
		let child = child_process.spawn(binaryPath, [pathToShaderFile]);
		child.stdout.on('data', chunk => stdout += chunk);
		child.on('error', err => {
			vscode.window.showErrorMessage(stdout);
			vscode.window.showErrorMessage(err.message);
			return
		});
		child.on('close', code => {
			if (code != 0) {
				vscode.window.showErrorMessage(stdout);
			}
			return
		});
	});
}

export function deactivate() { }
