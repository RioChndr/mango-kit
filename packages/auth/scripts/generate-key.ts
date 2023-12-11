import process from "https://deno.land/std@0.132.0/node/process.ts";

/**
 * Exampe : Run `deno run --allow-read --allow-write packages/auth/scripts/generate-key.ts auth.key`
 * 
 * This script will generate a key and save it to `auth.key` file
 */

// This file should only run as cli

const targetLocation = process.argv[2] || "auth.key"

let keySaved;
try{
  keySaved = Deno.readFileSync(targetLocation)
	console.log("Key found at", targetLocation)
	console.log("Re-run this script with a different target location to generate a new key")
	Deno.exit(1)
// deno-lint-ignore no-empty
}catch(_){}

let key;

if(!keySaved){
  key = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-512" },
    true,
    ["sign", "verify"],
  );
  
  const exportKey = await crypto.subtle.exportKey("raw", key);
  const keyString = new TextDecoder().decode(exportKey)
  await Deno.writeTextFile(targetLocation, keyString)
} else {
  key = await crypto.subtle.importKey(
    "raw",
    keySaved,
    { name: "HMAC", hash: "SHA-512" },
    true,
    ["sign", "verify"],
  );
}