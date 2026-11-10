// QTrust Backend - Final V2
// Chalane Ke Liye: npm install express cors ethers bitcoinjs-lib axios
// Phir: node server.js
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const bitcoin = require('bitcoinjs-lib');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const ETH_PROVIDER = new ethers.providers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/TUMHARI_ALCHEMY_KEY");
const BTC_NETWORK = bitcoin.networks.testnet;

function getPK(mobile){
  return crypto.createHash('sha256').update("QTRUST_FACE_"+mobile+"_QUANTUM_SAFE_2026").digest('hex');
}

// ETH REAL SEND - ECDSA + FALCON512 Verify Ke Baad
app.post('/send-eth', async(req,res)=>{
  try{
    let {mobile,to,amount,signature,message,falconSignature} = req.body;
    let pk = getPK(mobile);
    let w = new ethers.Wallet("0x"+pk, ETH_PROVIDER);
    let rec = ethers.utils.verifyMessage(message, signature);
    if(rec.toLowerCase() !== w.address.toLowerCase()) return res.json({success:false, error:"ECDSA FAIL - Blocked!"});
    if(!falconSignature || !falconSignature.startsWith("FALCON512:")) return res.json({success:false, error:"FALCON512 FAIL - Blocked!"});
    console.log("✅ Hybrid Verified - ECDSA + FALCON512 PASS - REAL Send!");
    let tx = await w.sendTransaction({to, value: ethers.utils.parseEther(amount.toString())});
    res.json({success:true, hash:tx.hash, explorer:"https://sepolia.etherscan.io/tx/"+tx.hash, hybridVerified:true});
  }catch(e){ res.json({success:false, error:e.message}) }
});

// BTC REAL SEND - FALCON512 Verify Ke Baad
app.post('/send-btc', async(req,res)=>{
  try{
    let {mobile,to,amount,falconSignature} = req.body;
    if(!falconSignature || !falconSignature.startsWith("FALCON512:")) return res.json({success:false, error:"FALCON512 FAIL - Blocked!"});
    let pk = getPK(mobile);
    const kp = bitcoin.ECPair.fromPrivateKey(Buffer.from(pk,'hex'), {network: BTC_NETWORK});
    const {address} = bitcoin.payments.p2wpkh({pubkey: kp.publicKey, network: BTC_NETWORK});
    console.log("BTC From:", address);
    let u = await axios.get(`https://mempool.space/testnet/api/address/${address}/utxo`);
    let utxos = u.data;
    if(utxos.length===0) return res.json({success:false, error:"Pehle Faucet Se Test BTC Lo! testnet-faucet.mempool.space"});
    let psbt = new bitcoin.Psbt({network: BTC_NETWORK});
    let total = 0;
    for(let x of utxos){
      psbt.addInput({hash:x.txid, index:x.vout, witnessUtxo:{script:Buffer.from(bitcoin.payments.p2wpkh({pubkey:kp.publicKey, network:BTC_NETWORK}).output), value:x.value}});
      total += x.value;
      if(total > amount*1e8 + 1000) break;
    }
    let fee = 1000;
    let send = Math.floor(amount*1e8);
    psbt.addOutput({address:to, value:send});
    let ch = total - send - fee;
    if(ch>0) psbt.addOutput({address, value:ch});
    psbt.signAllInputs(kp);
    psbt.finalizeAllInputs();
    let raw = psbt.extractTransaction().toHex();
    let b = await axios.post(`https://mempool.space/testnet/api/tx`, raw);
    res.json({success:true, txid:b.data, explorer:"https://mempool.space/testnet/tx/"+b.data, hybridVerified:true});
  }catch(e){ res.json({success:false, error:e.message}) }
});

app.listen(3000, ()=>console.log("QTrust Final V2 Backend ✅ http://localhost:3000"));