import {createDaceProfile, createProfile, duplicateProfile} from './model';
import preset from './dace.json';
const originalCrypto=Object.getOwnPropertyDescriptor(global,'crypto');
beforeAll(()=>{Object.defineProperty(global,'crypto',{configurable:true,value:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'}});});
afterAll(()=>{if(originalCrypto)Object.defineProperty(global,'crypto',originalCrypto);else delete global.crypto;});
test('DACE templates enable theme tags, ordinary new profiles use a single theme',()=>{
 expect(createDaceProfile('https://test.example').multipleThemes).toBe(true);
 expect(createProfile('https://test.example').multipleThemes).toBe(false);
});
test('duplicating older DACE templates retains the effective theme setting',()=>{
 const old={...preset};delete old.multipleThemes;
 expect(duplicateProfile(old).multipleThemes).toBe(true);
 expect(duplicateProfile({...old,multipleThemes:false}).multipleThemes).toBe(false);
});
