function updateToGo() {
    Array.prototype.slice.call(document.querySelectorAll("#eventlist li.upcoming time")).forEach(function(t) {
        var togo = moment(t.getAttribute("datetime")).from();
        var span = t.querySelector("span.togo");
        if (!span) {
            span = document.createElement("span");
            span.className = "togo";
            span.appendChild(document.createTextNode(" "));
            t.appendChild(span);
        }
        span.firstChild.nodeValue = " (" + togo.toString() + ")";
    });
}

document.addEventListener("DOMContentLoaded", function() {
    updateToGo();
});

setInterval(updateToGo, 60000);