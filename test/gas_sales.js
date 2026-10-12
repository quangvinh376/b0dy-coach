/* Sales.gs (lệnh 'bank') chạy THẬT trên Node với PropertiesService giả — PIN và số tài khoản đều GIẢ (repo công khai).
   Chạy: node test/gas_sales.js */
var fs=require('fs'), path=require('path'), vm=require('vm'), assert=require('assert');
var src=fs.readFileSync(path.join(__dirname,'..','backend','Sales.gs'),'utf8');
function mk(props){
  var ctx={ PropertiesService:{ getScriptProperties:function(){ return { getProperty:function(k){ return props.hasOwnProperty(k) ? props[k] : null; } }; } },
            lbCoachByPin_:function(pin){ return pin==='1111' ? 'Quyết Hán' : ''; },
            adminOk_:function(p){ return p && p.apin==='9999'; } };
  vm.createContext(ctx); vm.runInContext(src, ctx); return ctx;
}
var c=mk({VIETQR_ACCOUNT:' 0123 456 789 ', VIETQR_NAME:'HO KINH  DOANH B0DY STUDIO'});
assert.deepEqual(JSON.parse(JSON.stringify(c.salesBank_({pin:'1111'}))), {ok:true, bin:'970407', acc:'0123456789', bank:'TECHCOMBANK', name:'HO KINH DOANH B0DY STUDIO'});
assert.equal(c.salesBank_({apin:'9999'}).ok, true, 'PIN admin');
assert.equal(c.salesBank_({pin:'0000'}).error, 'sai_pin'); assert.equal(c.salesBank_({}).error, 'sai_pin'); assert.equal(c.salesBank_({apin:'1'}).error, 'sai_pin');
assert.equal(mk({}).salesBank_({pin:'1111'}).error, 'no_bank', 'chưa cài tài khoản');
assert.equal(mk({VIETQR_ACCOUNT:'12a45'}).salesBank_({pin:'1111'}).error, 'no_bank', 'số tài khoản sai dạng');
var o=mk({VIETQR_ACCOUNT:'0123456789', VIETQR_BIN:'970415'}).salesBank_({pin:'1111'}); assert.equal(o.bin, '970415'); assert.equal(o.bank, '');
assert.equal(mk({VIETQR_ACCOUNT:'0123456789', VIETQR_BIN:'xx'}).salesBank_({pin:'1111'}).bin, '970407', 'BIN sai dạng → Techcombank');
console.log('PASS gas_sales 9/9');
