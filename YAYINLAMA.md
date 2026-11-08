# Siteyi arkadaşlarınla paylaşmak için yayınlama

**Çalışan site: https://itu-chess.onrender.com** — arkadaşlarına bu bağlantıyı gönderebilirsin. `localhost:5173` yalnız senin bilgisayarında çalışır; online site için bilgisayarını açık tutman gerekmez. Aşağıdaki adımlar ilk kurulumun nasıl yapıldığını ve başka bir kurulumu/kurtarmayı anlatır.

İki ücretsiz hizmet kullanıyoruz:

- **Supabase:** Oyuncuların, turnuvaların ve sonuçların saklandığı veritabanı.
- **Render:** Uygulamayı ve eşlendirme motorunu çalıştıran sunucu.

Her adımda **Free / $0** seç. Ücretli yükseltme veya ödeme isteyen bir ekran çıkarsa durup ekranın başlığını paylaş. Şifreleri, API anahtarlarını ve gizli değerleri sohbetlere veya GitHub'a koyma.

## 1. Önce Supabase hesabına gir

1. [Supabase panelini aç](https://supabase.com/dashboard).
2. GitHub ile giriş seçeneğini kullan; hesabın `atilyucesoy`.
3. İlk girişte **Create organization / New organization** sorulursa adı `İTÜ Satranç`, planı **Free** seç.
4. **New project** ile proje oluştur:
   - Proje adı: `itu-chess`
   - Veritabanı şifresi: yeni, güçlü bir şifre belirle ve kendin sakla. Bu, sitedeki yönetici giriş şifresi değildir.
   - Bölge: Avrupa seçeneklerinden uygun olanı seç.
5. Projenin oluşturulmasını bekle.

**İlk aşamada burada durabilirsin.** Ekran adını veya şifre/anahtar içermeyen görüntüsünü paylaşarak sonraki düğmeye birlikte ilerleyebiliriz. Arayüzdeki başlıklar zamanla değişebilir.

## 2. Veritabanını hazırla

1. Supabase projesinde **SQL Editor** bölümünü aç, yeni sorgu oluştur.
2. Repodaki [`supabase/schema.sql`](supabase/schema.sql) dosyasını açıp tamamını kopyala.
3. SQL Editor'a yapıştır ve **Run** ile çalıştır. Bu şema boş kulüp kaydını, özel erişimi ve güvenli kayıt fonksiyonunu oluşturur.
4. **Project Settings / API** bölümlerinden **Project URL** ve sunucuya özel **service_role** anahtarının yerini bul. Anahtar bazı ekranlarda **API Keys → Legacy API Keys** altında gösterilebilir. `anon` anahtarı bu uygulamanın sunucu erişimi için yeterli değildir.
5. URL ve anahtarı birazdan Render'a gireceksin. Anahtarı açığa çıkarıp ekran görüntüsü gönderme.

## 3. Render'a gir, repoyu bağla

1. [Render panelini aç](https://dashboard.render.com/) ve GitHub ile giriş yap.
2. **New → Web Service** seç. **Static Site** seçme: bu uygulamada çalışan bir sunucu ve eşlendirme motoru var.
3. GitHub bağlantısını onaylayıp `atilyucesoy/itu-chess` reposunu seç.
4. Kurulum ekranında:

| Alan                         | Değer                                               |
| ---------------------------- | --------------------------------------------------- |
| Name                         | `itu-satranc` veya uygun boş bir ad                 |
| Runtime / Language           | Node                                                |
| Branch                       | `main`                                              |
| Build Command                | `npm ci && npm run engine:install && npm run build` |
| Start Command                | `npm start`                                         |
| Instance / Plan              | **Free**                                            |
| Health Check Path, sorulursa | `/api/health`                                       |

Root Directory'yi boş bırak. Repoda `render.yaml` ile Blueprint alternatifi de var; yukarıdaki alanlar elle Web Service oluşturmak içindir.

## 4. Gizli sunucu ayarlarını gir

Render'daki **Environment / Environment Variables** alanına aşağıdakileri ekle. Sağdaki açıklamalar yerine kendi değerlerini gireceksin:

| Key                         | Girilecek değer                                                         |
| --------------------------- | ----------------------------------------------------------------------- |
| `NODE_VERSION`              | `22.23.1`                                                               |
| `NODE_ENV`                  | `production`                                                            |
| `SUPABASE_URL`              | Supabase'deki Project URL                                               |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase'deki gizli `service_role` anahtarı                             |
| `ADMIN_USERNAME`            | `atil`                                                                  |
| `ADMIN_NAME`                | `Atıl`                                                                  |
| `ADMIN_PASSWORD`            | Sitenin ilk yönetici girişi için yeni, en az 12 karakterlik güçlü şifre |
| `SESSION_SECRET`            | En az 32 karakterlik rastgele gizli değer                               |

`SESSION_SECRET` üretmek için kendi terminalinde şu komutu çalıştırıp çıktıyı **yalnız Render'daki ilgili alana** yapıştırabilirsin:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Bu gizli değerleri bana göndermene gerek yok. `VITE_` ile başlayan değişkenlere veya README'ye koyma. `ALLOW_LOCAL_DB` ekleme: ücretsiz Render diski kalıcı değildir. Developer mode'u internette açmıyoruz.

## 5. İlk yayını aç

1. **Create Web Service / Deploy** ile başlat. Build ve kurulumun bitmesini bekle.
2. Render servis ekranının verdiği gerçek **https://…onrender.com** adresini aç.
3. Render Environment'a `APP_ORIGIN` ekle: değeri bu adresin tam HTTPS hâli, **sonunda `/` olmadan** olsun. Kaydet ve yeniden deploy et. İlk kurulumda bu değişken yoksa uygulama isteğin kendi origin'ini kullanır.
4. Siteye `atil` ve **Render'da belirlediğin `ADMIN_PASSWORD`** ile gir. Yerel `.env` şifreni kullanmak zorunda değilsin; bunlar ayrı kurulumlar.
5. Bu ayarlar yalnız ilk hesabı oluşturur. Daha sonra var olan hesabın şifresini değiştirmek için site içindeki **Kulüp ayarları** kullanılır; environment değerini değiştirmek mevcut hesabı sıfırlamaz.

İlk online veritabanı boş açılır. Yereldeki kayıtlar otomatik taşınmaz. Mevcut kayıtları taşımak gerekirse açık onayla ayrı bir yedek/geri yükleme adımı yapacağız; rastgele veritabanı sıfırlamayacağız.

## 6. Arkadaşlarınla paylaş

- İzlemeleri için Render adresini göndermen yeterli; oyuncuların hesap açması gerekmez.
- Yönetmeleri için **Kulüp ayarları → Turnuva yöneticileri → Yeni yönetici ekle** üzerinden her kişiye ayrı hesap aç. Kendi owner şifreni gruba gönderme.
- Public siteye yazdığın oyuncu isimleri ve ratingler herkese açık olur; kişisel telefon, öğrenci numarası vb. ekleme.
- Yerel developer deneme alanı production'da kapalıdır. Online normal turnuvaya `abc` kayıtları girersen bunlar gerçek online veritabanına yazılır; silinebilir yerel denemeyle karıştırma.

## Haftalık turnuvada ücretsiz plan sorun çıkarır mı?

**Başlangıç için makul, fakat kesintisiz hizmet garantisi yok.** Güncel ücretsiz koşullar:

- Render, 15 dakika hiç istek gelmezse uyur; bir sonraki açılış yaklaşık 1 dakika sürebilir. Açık turnuva/projeksiyon sayfasının normal yenilemeleri genellikle uyanık tutar; tüm sekmeler kapanırsa ya da tarayıcı istekleri durdurursa tekrar uyuyabilir.
- Render çalışma saatleri workspace başına ayda 750 saattir. Birden fazla ücretsiz sunucun varsa bu hak ortaktır. Ayrıca veri aktarımı/build kotaları vardır; kotayı aşınca servis veya yeni buildler durabilir. Paneldeki kullanım değerlerini izle.
- Supabase Free, bir haftalık hareketsizlikten sonra duraklatılabilir. Haftalık turnuvalar bu süreye yakın olduğu için bunu özellikle kontrol et. Proje **Paused** görünüyorsa panelden **Restore / Resume** yap.
- Supabase Free'de 500 MB veritabanı ve 5 GB veritabanı dışa veri aktarımı dahildir; otomatik yedek yoktur. Sayfa yenilemeleri değişmeyen veriyi tekrar indirmemek için ETag kullanır ve sunucu kısa süreli ortak okuma önbelleğiyle gereksiz veritabanı trafiğini azaltır. Bunlar kotanın hiçbir zaman dolmayacağı garantisi değildir; arşiv/izleyici sayısı büyüdükçe ölçmek gerekir.
- Render her an yeniden başlatma yapabilir. Başarıyla kaydedilmiş kayıtlar Supabase'de kalır; kısa süreli erişim kesintisi yine de olabilir. Ücretsiz Render Postgres'i **kullanmıyoruz**; onun veritabanı 30 günde sona erer.

### Turnuva gecesi kontrol listesi

1. **15–20 dakika önce** siteyi aç, Supabase projesinin aktif olduğunu kontrol et.
2. Yönetici girişini ve oyuncu/turnuva listesinin yüklendiğini doğrula.
3. Turnuva sırasında GitHub'a yeni sürüm gönderip otomatik deploy/restart tetiklememeye çalış; güncellemeleri turnuva dışına bırak.
4. Tur sonlarında **tam yedek** al. Yedek şifre hashleri içerdiği için özel tut; GitHub'a koyma.
5. İnternet/sunucu kesilirse sonuçları geçici olarak kâğıda yaz; bağlantı gelince sisteme gir. Uygulamanın otomatik offline kayıt/senkronizasyonu yoktur.

Kaynaklar (2026-11-08 kontrolü): [Render Free](https://render.com/docs/free), [Supabase Free](https://supabase.com/pricing). Sağlayıcılar koşulları değiştirebilir; kurulum ekranındaki güncel plan ve kullanım paneli esas alınmalı.
