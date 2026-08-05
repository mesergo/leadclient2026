/* LeadClient embeddable intake widget. Usage:
   <script src="https://YOUR_HOST/leadclient.js?CH=SERVICE_HASH"></script>
   then call: LeadClient.submit({ name, phone, email })
   or set CO=COMPANY_TOKEN to route to the company's default channel. */
(function () {
  var s = document.currentScript;
  var url = new URL(s.src);
  var CH = url.searchParams.get('CH');
  var CO = url.searchParams.get('CO');
  var API = url.origin;
  function submit(lead) {
    var path = CH ? '/api/public/leads/service/' + CH : '/api/public/leads/company/' + CO;
    return fetch(API + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lead || {}),
    }).then(function (r) { return r.json(); });
  }
  window.LeadClient = { submit: submit, CH: CH, CO: CO };
})();
