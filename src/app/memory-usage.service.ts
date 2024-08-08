import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class MemoryUsageService {
  constructor() {}

  roughSizeOfObject(object: any): number {
    const objectList = new Set();
    const stack = [object];
    let bytes = 0;

    while (stack.length) {
      const value = stack.pop();

      if (typeof value === 'boolean') {
        bytes += 4;
      } else if (typeof value === 'string') {
        bytes += value.length * 2;
      } else if (typeof value === 'number') {
        bytes += 8;
      } else if (typeof value === 'object' && value !== null && !objectList.has(value)) {
        objectList.add(value);

        for (const key in value) {
          if (value.hasOwnProperty(key)) {
            stack.push(value[key]);
          }
        }
      }
    }

    return bytes;
  }

  roughSizeOfArrayOfObjects(array: any[]): number {
    let totalSize = 0;

    for (const obj of array) {
      totalSize += this.roughSizeOfObject(obj);
    }

    return totalSize;
  }
}
