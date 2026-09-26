> ⛔ **ĐÃ THAY — KHÔNG ÁP DỤNG FILE NÀY (26/09/2026, v2.4).** Bản nháp này chưa từng được dán vào Apps Script. `ipOk_` đang chạy đọc `STUDIO_IP` dạng danh sách ngăn bằng dấu phẩy, và `iplist` / `addip` / `delip` nay nằm trong `backend/Admin.gs` (xem `backend/README.md` mục 7). Dán code dưới đây sẽ trùng `case` và đổi cách lưu IP. Giữ lại chỉ để tra lịch sử.

# Hai IP được check-in — sửa `Code.gs` (v2.3.2)

Màn Admin của app lưu **tối đa 2 IP**, cả hai đều được check-in: ô 1 = `STUDIO_IP` (IP phòng, giữ nguyên), ô 2 = `STUDIO_IP2`. Nút **Thêm IP** ghi IP của thiết bị đang mở app vào ô trống; nút × xoá ô đó (xoá xong mới thêm được IP mới). Ba action mới `iplist` / `addip` / `delip`, đều cần PIN admin.

## 1. Thay hàm `ipOk_`

```js
function ipOk_(p) {
  if (adminOk_(p)) return true; // admin duoc truy cap tu xa
  var ips = ipList_();
  if (!ips[0] && !ips[1]) return true; // chua dang ky IP nao -> tam cho qua
  var ip = String(p.ip || '').trim();
  return ip !== '' && (ip === ips[0] || ip === ips[1]);
}
function ipList_() {
  var props = PropertiesService.getScriptProperties();
  return [String(props.getProperty('STUDIO_IP') || '').trim(), String(props.getProperty('STUDIO_IP2') || '').trim()];
}
```

## 2. Thêm 3 hàm (cạnh `apiSetIp_`)

```js
function apiIpList_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  return { ok: true, ips: ipList_() };
}
function apiAddIp_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var ip = String(p.ip || '').trim();
  if (!ip) return { ok: false, error: 'thieu_ip' };
  var props = PropertiesService.getScriptProperties(), ips = ipList_();
  if (ips.indexOf(ip) < 0) {
    if (!ips[0]) props.setProperty('STUDIO_IP', ip);
    else if (!ips[1]) props.setProperty('STUDIO_IP2', ip);
    else return { ok: false, error: 'full' };
  }
  return { ok: true, ips: ipList_() };
}
function apiDelIp_(p) {
  if (!adminOk_(p)) return { ok: false, error: 'sai_pin' };
  var slot = Number(p.slot);
  if (slot !== 1 && slot !== 2) return { ok: false, error: 'sai_slot' };
  PropertiesService.getScriptProperties().deleteProperty(slot === 1 ? 'STUDIO_IP' : 'STUDIO_IP2');
  return { ok: true, ips: ipList_() };
}
```

## 3. Thêm `case` trong `api_()` (cạnh `case 'setip'`)

```js
      case 'iplist':  out = apiIpList_(p); break;
      case 'addip':   out = apiAddIp_(p);  break;
      case 'delip':   out = apiDelIp_(p);  break;
```

`setip` cũ vẫn giữ (ghi đè ô 1) nhưng app không dùng nữa.

## 4. Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy

Sau đó trên máy cần thêm: mở app ▸ PIN admin ▸ danh sách hiện 2 ô ▸ **Thêm IP** (ô trống nhận IP thiết bị này). Đủ 2 ô thì nút báo "Đã đủ 2 IP · xoá bớt": bấm × ở ô muốn bỏ rồi thêm lại.
