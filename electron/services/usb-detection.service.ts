import { execFile } from 'child_process';
import { createUsbToken, resolveUsbToken } from '../core/usb-token.store';
import { DetectedUsbDriveDto } from '../../shared/ipc-contracts';

export type ExecFileFunction = (
  file: string,
  args: ReadonlyArray<string>,
  options: { timeout?: number },
  callback: (error: Error | null, stdout: string, stderr: string) => void
) => void;

/**
 * Detect removable Windows drives (DriveType=2).
 * Strictly bounds execution timeout (3s) and uses fixed parameters with zero user input.
 * On non-Windows platforms, returns empty list safely.
 */
export async function detectRemovableDrives(
  senderWebContentsId: number,
  execFileFn: ExecFileFunction = execFile as unknown as ExecFileFunction
): Promise<DetectedUsbDriveDto[]> {
  if (process.platform !== 'win32') {
    return [];
  }

  const psCommand =
    'Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=2" | ' +
    'Select-Object DeviceID, VolumeName, FreeSpace, Size | ConvertTo-Json -Compress';

  return new Promise((resolve) => {
    execFileFn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCommand],
      { timeout: 3000 },
      (error, stdout) => {
        if (error || !stdout || !stdout.trim()) {
          resolve([]);
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          const list = Array.isArray(parsed) ? parsed : [parsed];
          const result: DetectedUsbDriveDto[] = [];

          for (const item of list) {
            if (!item || typeof item.DeviceID !== 'string') continue;
            const deviceId = item.DeviceID.trim();
            // Strict drive letter validation (e.g. "E:")
            if (!/^[A-Za-z]:$/.test(deviceId)) continue;

            const driveRoot = `${deviceId}\\`;
            const label =
              typeof item.VolumeName === 'string' && item.VolumeName.trim()
                ? item.VolumeName.trim()
                : `Removable Drive (${deviceId})`;
            const freeSpaceBytes = typeof item.FreeSpace === 'number' ? item.FreeSpace : Number(item.FreeSpace) || 0;
            const totalSpaceBytes = typeof item.Size === 'number' ? item.Size : Number(item.Size) || 0;

            const token = createUsbToken(deviceId, driveRoot, senderWebContentsId);

            result.push({
              id: token,
              label,
              freeSpaceBytes,
              totalSpaceBytes,
            });
          }

          resolve(result);
        } catch {
          resolve([]);
        }
      }
    );
  });
}

/**
 * Re-validate that a given DeviceID is indeed DriveType=2 (removable) at backup creation time.
 */
export async function revalidateDriveType2(
  deviceId: string,
  execFileFn: ExecFileFunction = execFile as unknown as ExecFileFunction
): Promise<boolean> {
  if (process.platform !== 'win32') {
    return false;
  }

  // Strict check before passing to CIM query
  if (!/^[A-Za-z]:$/.test(deviceId)) {
    return false;
  }

  const psCommand = `Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='${deviceId}' and DriveType=2" | Select-Object DeviceID | ConvertTo-Json -Compress`;

  return new Promise((resolve) => {
    execFileFn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', psCommand],
      { timeout: 3000 },
      (error, stdout) => {
        if (error || !stdout || !stdout.trim()) {
          resolve(false);
          return;
        }

        try {
          const parsed = JSON.parse(stdout.trim());
          const match = Array.isArray(parsed) ? parsed[0] : parsed;
          resolve(match && match.DeviceID && match.DeviceID.toUpperCase() === deviceId.toUpperCase());
        } catch {
          resolve(false);
        }
      }
    );
  });
}
