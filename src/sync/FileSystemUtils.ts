/**
 * FileSystemUtils - Utilities for File System Access API
 */

export class FileSystemUtils {
  /**
   * Check if the File System Access API is available
   */
  static isFileSystemAccessSupported(): boolean {
    return typeof window !== 'undefined' && 
           'showOpenFilePicker' in window && 
           'showSaveFilePicker' in window;
  }
}
