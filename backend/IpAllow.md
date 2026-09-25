# IP test ngoài phòng — sửa `Code.gs` (v2.3.1)

Nút **Thêm IP này để test** trong màn Admin của app gọi action `addip` (kèm PIN admin) → máy chủ ghi IP hiện tại của thiết bị vào Script Property `TEST_IPS` (danh sách, phân cách bằng dấu phẩy). IP phòng (`STUDIO_IP`) không đổi, khoá IP vẫn giữ cho coach. Muốn bỏ IP test: xoá trong Project Settings ▸ Script Properties ▸ `TEST_IPS`.

## 1. Thay hàm `ipOk_` trong `Code.gs`

```js
function ipOk_(p) {
  if (adminOk_(p)) return true; // admin duoc truy cap tu xa
  var props = PropertiesService.getScriptProperties();
  var want = props.getProperty('STUDIO_IP');
  if (!want) return true; // chua dang ky IP phong -> tam cho qua
  var ip = String(p.ip || '').trim();
  if (ip === String(want).trim()) return true;
  /* IP test (Script Property TEST_IPS: "1.2.3.4, 5.6.7.8") — thêm bằng nút "Thêm IP này để test" ở màn Admin */
  var test = String(props.getProperty('TEST_IPS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  return ip !== '' && test.indexOf(ip) >= 0;
}
```

## 2. Thêm hàm `apiAddIp_` (cạnh `apiSetIp_`)

```js
function apiAddIp_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var ip = String(p.ip || '').trim();
  if (!ip) return { ok: false, error: 'thieu_ip' };
  var props = PropertiesService.getScriptProperties();
  var list = String(props.getProperty('TEST_IPS') || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  if (list.indexOf(ip) < 0) list.push(ip);
  props.setProperty('TEST_IPS', list.join(','));
  return { ok: true, ip: ip, ips: list };
}
```

## 3. Thêm `case` trong `api_()` (cạnh `case 'setip'`)

```js
      case 'addip':   out = apiAddIp_(p); break;
```

## 4. Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy

Sau đó trên máy cần test: mở app ▸ nhập PIN admin ▸ **Thêm IP này để test** ▸ pill "Đã thêm IP test". Check-in từ mạng đó sẽ được nhận. Lưu ý IP nhà mạng di động đổi thường xuyên; mỗi lần đổi mạng bấm thêm lại.
