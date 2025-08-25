// Debug script to test WildcardTranslator
import { WildcardTranslator } from './dist/src/ftp/wildcard-translator.js';

console.log('Testing WildcardTranslator...');

const testPath = '/data/users/john*';
console.log('Input path:', testPath);

const result = WildcardTranslator.translatePath(testPath);
console.log('Result:', JSON.stringify(result, null, 2));